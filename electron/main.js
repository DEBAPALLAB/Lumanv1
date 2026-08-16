const {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  dialog,
  Menu,
  Tray,
  Notification,
  desktopCapturer,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const { fork } = require('node:child_process');
const { log, initLogging, watchProcessCrashes, openLogFolder, copyDiagnostics, getLogFilePath } = require('./logging');
const { initAutoUpdates, checkForUpdatesInteractive } = require('./updater');

let mainWindow = null;
let serverProcess = null;
let resolvedPort = null;
let tray = null;

const DEFAULT_PORT = Number(process.env.PORT) || 3982;
const isDev = !app.isPackaged;

/**
 * The backend a build talks to when it has no secret of its own.
 *
 * Baked in so a fresh install works with zero configuration — the user
 * downloads an installer and signs in, full stop. Overridable at launch (env
 * var or config.json) so one binary can be pointed at staging.
 */
const DEFAULT_SITE_URL = 'https://lumanv1.vercel.app';

/**
 * Configuration the embedded server needs at launch, read from (in priority
 * order):
 *   1. process.env            (dev, or an explicitly exported var)
 *   2. <userData>/config.json (installed builds)
 *   3. .env next to the executable (portable builds)
 *
 * Everything here is either publishable (the Supabase URL and anon key are
 * client-side values by design, governed by RLS) or a plain origin. Nothing
 * on this list grants privilege.
 *
 * NEXT_PUBLIC_* names are inlined by Next at build time and cannot truly be
 * overridden at runtime; they are carried so a build without them inlined
 * still works.
 */
const RUNTIME_CONFIG_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  // Read server-side by /api/config and by lib/server/delegate.ts. Only the
  // non-public spelling is a real runtime lookup.
  'SITE_URL',
  'NEXT_PUBLIC_SITE_URL',
];

/**
 * Server secrets that must NEVER reach a user's machine.
 *
 * The service-role key bypasses every RLS rule in the database; the AI keys
 * are billable; the Blob token grants write access to storage. An Electron
 * package is an archive, not a vault — anything shipped inside one is
 * extractable in seconds.
 *
 * The routes that need these no longer require them locally: when a key is
 * absent, the route forwards the request to the deployed backend carrying the
 * user's own access token (lib/server/delegate.ts). So an installed build
 * simply never loads them, and this list exists to say so explicitly.
 *
 * They are still loaded in a dev run, where they come from your own
 * .env.local, so `pnpm electron` behaves exactly like `pnpm dev`. Set
 * LUMAN_SIMULATE_DESKTOP=1 to withhold them and exercise the delegation path
 * locally.
 */
const DELEGATED_SECRET_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'BLOB_READ_WRITE_TOKEN',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
];

function parseEnvFile(filePath) {
  const out = {};
  try {
    if (!fs.existsSync(filePath)) return out;
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key) out[key] = value;
    }
  } catch (err) {
    console.error('Failed to parse env file', filePath, err);
  }
  return out;
}

/**
 * Keys this launch is allowed to pass to the embedded server. An installed
 * build gets configuration only; a dev run also gets the delegated secrets so
 * it behaves identically to `pnpm dev`.
 */
function allowedRuntimeKeys() {
  const simulateDesktop = process.env.LUMAN_SIMULATE_DESKTOP === '1';
  if (!isDev || simulateDesktop) return RUNTIME_CONFIG_KEYS;
  return [...RUNTIME_CONFIG_KEYS, ...DELEGATED_SECRET_KEYS];
}

function loadRuntimeConfig() {
  const keys = allowedRuntimeKeys();
  const config = {};

  // 4. Built-in default, so a fresh install needs no configuration at all.
  config.SITE_URL = DEFAULT_SITE_URL;

  // 3. .env beside the executable (portable installs)
  const exeDir = path.dirname(app.getPath('exe'));
  const portableEnv = parseEnvFile(path.join(exeDir, '.env'));
  for (const key of keys) {
    if (portableEnv[key]) config[key] = portableEnv[key];
  }

  // 3b. In a dev run, .env.local is the developer's own config. Next loads it
  // for `pnpm dev`; the standalone server does not, so `pnpm electron` used to
  // start with nothing unless the shell happened to export it.
  if (isDev) {
    const devEnv = parseEnvFile(path.join(__dirname, '..', '.env.local'));
    for (const key of keys) {
      if (devEnv[key]) config[key] = devEnv[key];
    }
  }

  // 2. userData config.json
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      for (const key of keys) {
        if (parsed[key]) config[key] = String(parsed[key]);
      }
    }
  } catch (err) {
    log.error('Failed to read userData config.json:', err);
  }

  // 1. Real process env wins (an explicitly exported var)
  for (const key of keys) {
    if (process.env[key]) config[key] = process.env[key];
  }

  return config;
}

/** Find the Next.js standalone server.js regardless of monorepo nesting. */
function resolveStandaloneServer() {
  // In a packaged build the standalone tree is unpacked out of the asar
  // (see "asarUnpack"), so it lives under app.asar.unpacked.
  const roots = isDev
    ? [path.join(__dirname, '..')]
    : [
        path.join(process.resourcesPath, 'app.asar.unpacked'),
        path.join(process.resourcesPath, 'app'),
        process.resourcesPath,
        path.join(__dirname, '..'),
      ];

  const candidates = [];
  for (const root of roots) {
    candidates.push(
      path.join(root, '.next', 'standalone', 'apps', 'web', 'server.js'),
      path.join(root, '.next', 'standalone', 'server.js'),
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function findAvailablePort(startPort, attempts = 20) {
  return new Promise((resolve) => {
    const tryPort = (port, remaining) => {
      if (remaining <= 0) return resolve(startPort);
      const tester = net
        .createServer()
        .once('error', () => tryPort(port + 1, remaining - 1))
        .once('listening', () => {
          tester.close(() => resolve(port));
        })
        .listen(port, '127.0.0.1');
    };
    tryPort(startPort, attempts);
  });
}

function checkServerReady(port, retries = 60) {
  return new Promise((resolve) => {
    const check = (attempt) => {
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve(true);
        } else {
          retry(attempt);
        }
      });
      req.on('error', () => retry(attempt));
      req.end();
    };

    const retry = (attempt) => {
      if (attempt >= retries) return resolve(false);
      setTimeout(() => check(attempt + 1), 500);
    };

    check(0);
  });
}

function startNextServer(port, serverPath) {
  const standaloneRoot = path.dirname(serverPath);
  log.info('Starting Next.js standalone server at:', serverPath);

  const runtimeConfig = loadRuntimeConfig();
  const allowed = new Set(allowedRuntimeKeys());

  const childEnv = {
    ...process.env,
    ...runtimeConfig,
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    NODE_ENV: 'production',
  };

  // The spread above inherits whatever the launching shell happened to export.
  // Strip any secret this launch is not allowed to carry, so an installed
  // build cannot pick one up by accident and LUMAN_SIMULATE_DESKTOP genuinely
  // simulates a user machine.
  for (const key of DELEGATED_SECRET_KEYS) {
    if (!allowed.has(key)) delete childEnv[key];
  }

  log.info('[config] backend origin:', runtimeConfig.SITE_URL, '| local secrets:', allowed.size - RUNTIME_CONFIG_KEYS.length);

  serverProcess = fork(serverPath, [], {
    cwd: standaloneRoot,
    env: childEnv,
    stdio: 'inherit',
  });

  serverProcess.on('error', (err) => {
    log.error('Failed to start Next.js server process:', err);
  });

  serverProcess.on('exit', (code, signal) => {
    log.info(`Next.js server exited (code=${code}, signal=${signal})`);
    serverProcess = null;
  });
}

function isInternalUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    // Supabase rewrites the callback origin to `localhost`, so both loopback
    // spellings must count as internal or the app ejects its own pages.
    const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
    return isLoopback && parsed.port === String(resolvedPort);
  } catch {
    return false;
  }
}

/**
 * Deep-link sign-in handoff.
 *
 * OAuth runs in the user's real browser (where they are already signed in to
 * Google). The web callback then bounces the one-time auth `code` back to the
 * desktop app via the `luman://` protocol. This app exchanges that code on its
 * OWN local server, so the session cookie is written to the desktop window's
 * cookie jar instead of the browser's.
 */
const PROTOCOL = 'luman';

// A deep link can arrive before the window/server are ready (cold start via
// protocol launch). Hold it until the app is able to act on it.
let pendingDeepLink = null;

/** Consume a `luman://auth/callback?code=...` deep link. */
function handleDeepLink(rawUrl) {
  console.log('[deep-link] handleDeepLink called with:', rawUrl);
  if (!rawUrl || !rawUrl.startsWith(`${PROTOCOL}://`)) return;

  // Not ready yet - replay once the window finishes booting.
  if (!resolvedPort || !mainWindow || mainWindow.isDestroyed()) {
    pendingDeepLink = rawUrl;
    return;
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return;
  }

  const accessToken = parsed.searchParams.get('access_token');
  const refreshToken = parsed.searchParams.get('refresh_token');
  const org = parsed.searchParams.get('org');
  const errorParam = parsed.searchParams.get('error');

  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();

  if (accessToken && refreshToken) {
    // The browser already exchanged the auth code (it owns the PKCE verifier).
    // Install the resulting session on the embedded server so the cookie lands
    // in this window's jar.
    const target = new URL(`http://127.0.0.1:${resolvedPort}/auth/desktop-session`);
    target.searchParams.set('access_token', accessToken);
    target.searchParams.set('refresh_token', refreshToken);
    if (org) target.searchParams.set('org', org);
    mainWindow.loadURL(target.toString());

    if (Notification.isSupported()) {
      new Notification({
        title: 'Signed in to Luman',
        body: 'Your workspace is ready.',
        icon: resolveIconPath(),
      }).show();
    }
  } else if (errorParam) {
    const target = new URL(`http://127.0.0.1:${resolvedPort}/desktop`);
    target.searchParams.set('error', errorParam);
    mainWindow.loadURL(target.toString());
  }
}

/** Replay a deep link that arrived before the app was ready. */
function flushPendingDeepLink() {
  if (!pendingDeepLink) return;
  const url = pendingDeepLink;
  pendingDeepLink = null;
  handleDeepLink(url);
}

function registerProtocolHandler() {
  if (process.defaultApp) {
    // Running unpackaged (`electron .` / `electron <dir>`). Register the
    // resolved app directory so the launcher Windows invokes matches the
    // instance already running, regardless of how it was started.
    const appPath = path.resolve(process.argv[1] || app.getAppPath());
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [appPath]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Luman',
    icon: path.join(__dirname, '..', 'public', 'favicon.ico'),
    frame: false,
    backgroundColor: '#020817',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Answers getDisplayMedia() with whatever the in-app picker chose (see the
  // screen:* IPC handlers). Without this Chromium has no picker of its own in
  // Electron and the promise rejects, which is why sharing silently failed.
  mainWindow.webContents.session.setDisplayMediaRequestHandler(
    (_request, callback) => {
      if (!pendingShareSourceId) {
        // Denies rather than guessing a source — sharing the wrong screen is
        // worse than not sharing at all.
        callback({});
        return;
      }

      const chosen = pendingShareSourceId;
      pendingShareSourceId = null;

      desktopCapturer
        .getSources({ types: ['screen', 'window'] })
        .then((sources) => {
          const source = sources.find((s) => s.id === chosen);
          // `audio: 'loopback'` shares system audio alongside the picture on
          // Windows; it is ignored elsewhere.
          callback(source ? { video: source, audio: 'loopback' } : {});
        })
        .catch(() => callback({}));
    },
    // The renderer draws its own picker, so Chromium must not also try to.
    { useSystemPicker: false },
  );

  const notifyMaximizeState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('window:maximize-changed', mainWindow.isMaximized());
  };
  mainWindow.on('maximize', notifyMaximizeState);
  mainWindow.on('unmaximize', notifyMaximizeState);

  // The desktop shell boots into its own entry route, never the marketing site.
  // /desktop resolves session state and routes to onboarding or /dashboard.
  const targetUrl = `http://127.0.0.1:${resolvedPort}/desktop`;
  const serverReady = await checkServerReady(resolvedPort);

  if (!serverReady) {
    log.error(`[startup] server never became ready on 127.0.0.1:${resolvedPort}`);
    dialog.showErrorBox(
      'Luman failed to start',
      `Luman's local service did not start on 127.0.0.1:${resolvedPort}.\n\n` +
        'This is usually a firewall or antivirus blocking local connections, or ' +
        'another program already using the port.\n\n' +
        `Details were written to:\n${getLogFilePath()}`,
    );
  }

  await mainWindow.loadURL(targetUrl);

  // Every external URL - including the OAuth consent screen - opens in the
  // user's real browser, where they are already signed in to their provider.
  // The browser hands the session back through the luman:// deep link.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) return { action: 'allow' };
    if (/^https?:/.test(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isInternalUrl(url)) return;
    if (/^https?:/.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/** Send a menu/tray action to the renderer, which owns routing. */
function sendMenuAction(action) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('menu:action', action);
}

function resolveIconPath() {
  const candidates = [
    path.join(__dirname, '..', 'public', 'icon.ico'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'public', 'icon.ico'),
    path.join(process.resourcesPath, 'public', 'icon.ico'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function buildApplicationMenu() {
  const template = [
    {
      label: '&File',
      submenu: [
        {
          label: 'New Workspace',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => sendMenuAction('new-workspace'),
        },
        {
          label: 'Switch Workspace…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendMenuAction('switch-workspace'),
        },
        { type: 'separator' },
        {
          label: 'Command Palette…',
          accelerator: 'CmdOrCtrl+K',
          click: () => sendMenuAction('command-palette'),
        },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => sendMenuAction('settings'),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit Luman' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '&View',
      submenu: [
        {
          label: 'Dashboard',
          accelerator: 'CmdOrCtrl+1',
          click: () => sendMenuAction('dashboard'),
        },
        {
          label: 'Tasks',
          accelerator: 'CmdOrCtrl+2',
          click: () => sendMenuAction('tasks'),
        },
        {
          label: 'Calendar',
          accelerator: 'CmdOrCtrl+3',
          click: () => sendMenuAction('calendar'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+\\',
          click: () => sendMenuAction('toggle-sidebar'),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '&Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
    {
      label: '&Help',
      submenu: [
        {
          label: 'Check for Updates…',
          click: () => checkForUpdatesInteractive(() => mainWindow),
        },
        { type: 'separator' },
        // The two things a support conversation always needs, one click each,
        // so a user never has to be talked through finding them.
        {
          label: 'Open Log Folder',
          click: () => openLogFolder(),
        },
        {
          label: 'Copy Diagnostics',
          click: () => {
            copyDiagnostics({ 'Server port': resolvedPort ?? 'not started' });
            if (mainWindow && !mainWindow.isDestroyed()) {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Copied',
                message: 'Diagnostics copied to your clipboard.',
                detail: 'Paste this into your bug report.',
                buttons: ['OK'],
              });
            }
          },
        },
        { type: 'separator' },
        {
          label: 'About Luman',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Luman',
              message: 'Luman',
              detail: `Version ${app.getVersion()}\nYour team's workspace, on your desktop.`,
              buttons: ['Close'],
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  tray = new Tray(resolveIconPath());
  tray.setToolTip('Luman');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Luman', click: () => sendMenuAction('dashboard') },
      { type: 'separator' },
      { label: 'New Workspace', click: () => sendMenuAction('new-workspace') },
      { label: 'Command Palette…', click: () => sendMenuAction('command-palette') },
      { type: 'separator' },
      { role: 'quit', label: 'Quit Luman' },
    ]),
  );

  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

// ---- IPC handlers ----
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('notification:show', (_event, { title, body } = {}) => {
  if (!Notification.isSupported() || !title) return;
  new Notification({ title, body, icon: resolveIconPath() }).show();
});
ipcMain.handle('shell:openExternal', (_event, url) => {
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) return;
  shell.openExternal(url);
});

/**
 * Screen sharing.
 *
 * Chromium's own picker is not available to Electron: a renderer calling
 * getDisplayMedia() gets nothing unless the main process answers the request
 * itself. So the flow is inverted — the renderer lists sources, shows its own
 * picker (which also lets it match the rest of the app), and stashes the
 * chosen id here. The handler below then hands that source back to Chromium
 * when the renderer immediately follows up with getDisplayMedia().
 *
 * `pendingShareSourceId` is the handoff between those two steps. It is cleared
 * on use so a stale choice can never satisfy a later, unrelated request.
 */
let pendingShareSourceId = null;

ipcMain.handle('screen:getSources', async () => {
  // Thumbnails are for a picker grid, so they only need to be legible — full
  // resolution here would mean multi-megabyte payloads over IPC per source.
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 200 },
    fetchWindowIcons: true,
  });

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    kind: source.id.startsWith('screen:') ? 'screen' : 'window',
    thumbnail: source.thumbnail?.toDataURL() ?? null,
    appIcon: source.appIcon?.toDataURL() ?? null,
  }));
});

ipcMain.handle('screen:selectSource', (_event, sourceId) => {
  if (typeof sourceId !== 'string') return false;
  pendingShareSourceId = sourceId;
  return true;
});

ipcMain.handle('screen:cancelSelection', () => {
  pendingShareSourceId = null;
});

// Single instance lock so the tray/deep links focus an existing window later.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Windows/Linux deliver deep links as argv of a second launch, which the
  // single-instance lock funnels into the already-running app.
  app.on('second-instance', (_event, argv) => {
    console.log('[deep-link] second-instance argv:', argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const deepLink = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    console.log('[deep-link] matched:', deepLink);
    if (deepLink) handleDeepLink(deepLink);
  });

  // macOS delivers deep links through this event instead.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  app.whenReady().then(async () => {
    initLogging();
    watchProcessCrashes(() => mainWindow);

    const serverPath = resolveStandaloneServer();

    if (!serverPath) {
      log.error('[startup] standalone server not found');
      dialog.showErrorBox(
        'Luman build missing',
        'Could not locate the Next.js standalone server (.next/standalone/**/server.js).\n\n' +
          'If you installed Luman, the installation is damaged — reinstall it.\n' +
          'If you are running from source, run `pnpm build:electron` first.',
      );
      app.quit();
      return;
    }

    registerProtocolHandler();

    resolvedPort = await findAvailablePort(DEFAULT_PORT);
    startNextServer(resolvedPort, serverPath);
    buildApplicationMenu();
    await createWindow();
    createTray();
    initAutoUpdates(() => mainWindow);

    // Cold start via deep link: the URL arrives in this process's argv.
    const initialLink = process.argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (initialLink) pendingDeepLink = initialLink;

    // Replay whatever arrived before the window was ready.
    flushPendingDeepLink();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', stopServer);
process.on('exit', stopServer);

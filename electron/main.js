const {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  dialog,
  Menu,
  Tray,
  Notification,
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { fork } = require('child_process');

let mainWindow = null;
let serverProcess = null;
let resolvedPort = null;
let tray = null;

const DEFAULT_PORT = Number(process.env.PORT) || 3982;
const isDev = !app.isPackaged;

/**
 * Runtime server secrets are NOT baked into the build. They are read at launch
 * from (in priority order):
 *   1. process.env            (dev: already populated from .env.local)
 *   2. <userData>/config.json (packaged: user-managed secrets file)
 *   3. .env next to the executable (portable builds)
 * Only server-side values belong here; NEXT_PUBLIC_* vars are inlined by Next
 * at build time and cannot be overridden at runtime.
 */
const RUNTIME_SECRET_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'BLOB_READ_WRITE_TOKEN',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  // Read server-side by /api/config so desktop OAuth can resolve the public
  // origin even when the build-time inline is missing.
  'NEXT_PUBLIC_SITE_URL',
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

function loadRuntimeSecrets() {
  const secrets = {};

  // 3. .env beside the executable (portable installs) - lowest priority
  const exeDir = path.dirname(app.getPath('exe'));
  Object.assign(secrets, parseEnvFile(path.join(exeDir, '.env')));

  // 2. userData config.json
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      for (const key of RUNTIME_SECRET_KEYS) {
        if (parsed[key]) secrets[key] = String(parsed[key]);
      }
    }
  } catch (err) {
    console.error('Failed to read userData config.json:', err);
  }

  // 1. Real process env wins (dev via .env.local, or an explicitly set var)
  for (const key of RUNTIME_SECRET_KEYS) {
    if (process.env[key]) secrets[key] = process.env[key];
  }

  return secrets;
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
  console.log('Starting Next.js standalone server at:', serverPath);

  serverProcess = fork(serverPath, [], {
    cwd: standaloneRoot,
    env: {
      ...process.env,
      ...loadRuntimeSecrets(),
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
    },
    stdio: 'inherit',
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start Next.js server process:', err);
  });

  serverProcess.on('exit', (code, signal) => {
    console.log(`Next.js server exited (code=${code}, signal=${signal})`);
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

  const notifyMaximizeState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('window:maximize-changed', mainWindow.isMaximized());
  };
  mainWindow.on('maximize', notifyMaximizeState);
  mainWindow.on('unmaximize', notifyMaximizeState);

  // The desktop shell boots into its own entry route, never the marketing site.
  const targetUrl = `http://127.0.0.1:${resolvedPort}/desktop`;
  const serverReady = await checkServerReady(resolvedPort);

  if (!serverReady) {
    dialog.showErrorBox(
      'Luman failed to start',
      `The local Luman server did not become ready on 127.0.0.1:${resolvedPort}.\n\n` +
        'Check that the application was built with `next build` (output: standalone).',
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

// Single instance lock so the tray/deep links focus an existing window later.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Windows/Linux deliver deep links as argv of a second launch, which the
  // single-instance lock funnels into the already-running app.
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const deepLink = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (deepLink) handleDeepLink(deepLink);
  });

  // macOS delivers deep links through this event instead.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  app.whenReady().then(async () => {
    const serverPath = resolveStandaloneServer();

    if (!serverPath) {
      dialog.showErrorBox(
        'Luman build missing',
        'Could not locate the Next.js standalone server (.next/standalone/**/server.js).\n\n' +
          'Run `pnpm build` in apps/web before launching the desktop app.',
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

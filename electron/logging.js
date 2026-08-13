/**
 * Crash and diagnostic logging for the desktop app.
 *
 * Before this existed, a bug on a user's machine produced "it doesn't work"
 * and nothing else: the embedded server logs to a console nobody is watching,
 * and a packaged app has no console at all. Now every process writes to one
 * rotating file under the app's own data directory, and the Help menu can open
 * it, so a user can attach a real log to a bug report.
 *
 * Deliberately local-only. No telemetry is sent anywhere — nothing to disclose
 * in a privacy policy, nothing to opt out of, no third-party account required
 * before the app can ship. Wiring a remote reporter (Sentry and friends) on top
 * later is a small change: this module is the single place errors funnel
 * through.
 */
const { app, shell, dialog, clipboard } = require('electron');
const path = require('node:path');
const os = require('node:os');
const log = require('electron-log/main');

let initialised = false;

function initLogging() {
  if (initialised) return log;
  initialised = true;

  // Lets renderer processes log through the same file via IPC.
  log.initialize();

  log.transports.file.level = 'info';
  log.transports.file.maxSize = 5 * 1024 * 1024; // rotates to main.old.log
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
  log.transports.console.level = 'debug';

  // Route the main process's existing console.* calls into the same file. A
  // packaged app has no console to read, so without this every log line
  // already in the codebase is written to nowhere.
  Object.assign(console, log.functions);

  // Uncaught exceptions and unhandled rejections in the main process. Without
  // this the app dies silently; `showDialog` tells the user something broke
  // instead of leaving them staring at a window that stopped responding.
  log.errorHandler.startCatching({
    showDialog: false,
    onError({ error, processType }) {
      log.error(`[uncaught:${processType || 'main'}]`, error);
    },
  });

  log.info('--- Luman starting ---', {
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    platform: `${process.platform} ${process.arch}`,
    packaged: app.isPackaged,
  });

  return log;
}

/**
 * Renderer and child-process crashes. These do not surface as exceptions in
 * the main process, so they have to be subscribed to explicitly or they vanish.
 */
function watchProcessCrashes(getWindow) {
  app.on('render-process-gone', (_event, webContents, details) => {
    log.error('[render-process-gone]', {
      reason: details.reason,
      exitCode: details.exitCode,
      url: (() => {
        try {
          return webContents.getURL();
        } catch {
          return 'unknown';
        }
      })(),
    });

    // `clean-exit` is an ordinary teardown, not a crash.
    if (details.reason === 'clean-exit') return;

    const window = getWindow?.();
    if (window && !window.isDestroyed()) {
      dialog
        .showMessageBox(window, {
          type: 'error',
          title: 'Luman stopped responding',
          message: 'The Luman window crashed and needs to reload.',
          detail: `Reason: ${details.reason}\n\nA log of what happened was saved. Help → Open Log Folder.`,
          buttons: ['Reload', 'Close'],
          defaultId: 0,
          cancelId: 1,
        })
        .then(({ response }) => {
          if (response === 0 && !window.isDestroyed()) window.reload();
        })
        .catch(() => {});
    }
  });

  app.on('child-process-gone', (_event, details) => {
    log.error('[child-process-gone]', {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      name: details.name,
    });
  });
}

function getLogFilePath() {
  return log.transports.file.getFile().path;
}

function openLogFolder() {
  shell.showItemInFolder(getLogFilePath());
}

/**
 * The facts a bug report needs, on the clipboard in one click — so a user does
 * not have to be talked through finding a version number.
 */
function copyDiagnostics(extra = {}) {
  const lines = [
    `Luman ${app.getVersion()}`,
    `Electron ${process.versions.electron} / Node ${process.versions.node} / Chrome ${process.versions.chrome}`,
    `Platform: ${process.platform} ${process.arch} (${os.release()})`,
    `Packaged: ${app.isPackaged}`,
    `Log file: ${getLogFilePath()}`,
    `Config dir: ${app.getPath('userData')}`,
    ...Object.entries(extra).map(([key, value]) => `${key}: ${value}`),
  ];
  clipboard.writeText(lines.join('\n'));
  return lines.join('\n');
}

module.exports = {
  log,
  initLogging,
  watchProcessCrashes,
  getLogFilePath,
  openLogFolder,
  copyDiagnostics,
  logDir: () => path.dirname(getLogFilePath()),
};

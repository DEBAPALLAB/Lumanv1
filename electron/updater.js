/**
 * Auto-updates.
 *
 * Without this, whatever version someone installs is the version they keep
 * forever — no bug fix, no feature, no security patch reaches them short of
 * emailing a new installer and hoping they run it. For a feedback launch where
 * the app changes weekly, that is the difference between a product and a
 * one-time download.
 *
 * Mechanics: electron-builder publishes the installer plus a `latest.yml`
 * manifest to GitHub Releases (the `publish` block in package.json). Installed
 * apps read that manifest, compare it against the `version` field baked into
 * their own package.json, download in the background if it is newer, and swap
 * the files in on the next restart.
 *
 * The one thing that decides whether an update is offered is the `version` in
 * package.json. Bump it for every release or nothing happens.
 *
 * Caveat, inherited from the decision to defer code signing: an unsigned
 * update cannot be cryptographically verified as yours. HTTPS to GitHub is the
 * only thing standing between a user and a tampered payload. That is the real
 * reason signing and auto-update normally ship together — revisit both before
 * a wider launch.
 */
const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { log } = require('./logging');

/** Re-check while the app stays open for days, which desktop apps do. */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let initialised = false;
let updateDownloaded = false;
let intervalTimer = null;

function describeError(err) {
  const message = err instanceof Error ? err.message : String(err);
  return message;
}

/**
 * @param {() => Electron.BrowserWindow | null} getWindow
 */
function initAutoUpdates(getWindow) {
  if (initialised) return;
  initialised = true;

  // A dev run has no update feed and no installed version to compare against;
  // electron-updater would just log an error on every launch.
  if (!app.isPackaged) {
    log.info('[updater] skipped: not a packaged build');
    return;
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  // Applies the already-downloaded update on quit, so a user who never clicks
  // "Restart now" still ends up current the next time they open the app.
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => log.info('[updater] checking for update'));
  autoUpdater.on('update-not-available', (info) =>
    log.info('[updater] up to date', info?.version ?? app.getVersion()),
  );
  autoUpdater.on('update-available', (info) => log.info('[updater] update available:', info?.version));
  autoUpdater.on('download-progress', (progress) =>
    log.info(`[updater] downloading ${Math.round(progress.percent)}%`),
  );

  autoUpdater.on('error', (err) => {
    // Never surfaced to the user: a failed update check is not something they
    // can act on, and an unreachable feed is normal when offline.
    log.error('[updater] failed:', describeError(err));
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateDownloaded = true;
    log.info('[updater] downloaded:', info?.version);

    const window = getWindow?.();
    dialog
      .showMessageBox(window && !window.isDestroyed() ? window : undefined, {
        type: 'info',
        title: 'Update ready',
        message: `Luman ${info?.version ?? ''} is ready to install.`.trim(),
        detail: 'Restart now to use it, or it will be applied the next time you close Luman.',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          // `isSilent: false` shows the installer's progress; the second flag
          // relaunches Luman once it finishes.
          autoUpdater.quitAndInstall(false, true);
        }
      })
      .catch((err) => log.error('[updater] restart prompt failed:', describeError(err)));
  });

  checkForUpdates();
  intervalTimer = setInterval(checkForUpdates, CHECK_INTERVAL_MS);
  app.on('will-quit', () => {
    if (intervalTimer) clearInterval(intervalTimer);
    intervalTimer = null;
  });
}

function checkForUpdates() {
  if (!app.isPackaged || updateDownloaded) return;
  autoUpdater.checkForUpdates().catch((err) => log.error('[updater] check failed:', describeError(err)));
}

/**
 * The Help → Check for Updates… path. Unlike the silent background check this
 * always tells the user what happened, because they asked.
 */
async function checkForUpdatesInteractive(getWindow) {
  const window = getWindow?.();
  const parent = window && !window.isDestroyed() ? window : undefined;

  if (!app.isPackaged) {
    await dialog.showMessageBox(parent, {
      type: 'info',
      title: 'Check for Updates',
      message: 'Updates are only available in an installed build.',
      detail: `You are running Luman ${app.getVersion()} from source.`,
      buttons: ['OK'],
    });
    return;
  }

  if (updateDownloaded) {
    await dialog.showMessageBox(parent, {
      type: 'info',
      title: 'Update ready',
      message: 'An update is already downloaded.',
      detail: 'It will be installed the next time you close Luman.',
      buttons: ['OK'],
    });
    return;
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    const latest = result?.updateInfo?.version;
    const isNewer = Boolean(latest) && latest !== app.getVersion();

    await dialog.showMessageBox(parent, {
      type: 'info',
      title: 'Check for Updates',
      message: isNewer ? `Luman ${latest} is downloading.` : "You're up to date.",
      detail: isNewer
        ? "You'll be asked to restart once it's ready."
        : `Luman ${app.getVersion()} is the latest version.`,
      buttons: ['OK'],
    });
  } catch (err) {
    log.error('[updater] interactive check failed:', describeError(err));
    await dialog.showMessageBox(parent, {
      type: 'warning',
      title: 'Check for Updates',
      message: 'Could not check for updates.',
      detail: `${describeError(err)}\n\nCheck your internet connection and try again.`,
      buttons: ['OK'],
    });
  }
}

module.exports = { initAutoUpdates, checkForUpdatesInteractive };

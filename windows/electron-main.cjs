/**
 * Dero Vault — Electron Main Process for Windows 10 / 11
 * Self-contained desktop runner: boots local backend server, handles system tray,
 * and exposes native Windows folder picker dialogs.
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, Notification, shell } = require('electron');
const path = require('path');
const http = require('http');
const { fork } = require('child_process');

// Determine execution environment and ensure NODE_ENV is set correctly
if (app.isPackaged || !process.env.NODE_ENV) {
  process.env.NODE_ENV = app.isPackaged ? 'production' : (process.env.NODE_ENV || 'development');
}
console.log(`[Main] [${new Date().toISOString()}] Electron starting: isPackaged=${app.isPackaged}, NODE_ENV=${process.env.NODE_ENV}, platform=${process.platform}`);

// On Windows, setting AppUserModelId is required for Windows toast notifications to display correctly
// and route click activation back to the application.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.derovault.app');
}

let mainWindow = null;
let tray = null;
let serverProcess = null;
const SERVER_PORT = 3000;

// SINGLE AUTHORITATIVE TRAY & DRIVE STATE
// Maintains persistent state for connected eligible drives, pending registrations, and backups.
const appState = {
  // Map of stableHardwareId -> RemovableDrive for currently connected drives
  connectedDrives: new Map(),

  // Pending unregistered drive awaiting user configuration/registration (or null)
  pendingRegistrationDrive: null,

  // Active backup session info (or null)
  activeBackup: null,

  // Transient status string and expiration timestamp
  transientStatus: null,
  transientExpiry: 0,
};

let lastUnregisteredDrive = null;
let pendingRegistrationDrive = null;
let updateTrayContextMenu = null;

// Native folder picker IPC handler
ipcMain.handle('dialog:browseFolder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Source Folder to Protect in Dero Vault',
    properties: ['openDirectory', 'dontAddToRecent'],
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('window:minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle('window:toggleMaximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return mainWindow.isMaximized();
  }
  return false;
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('window:minimizeToTray', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.handle('window:close', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.handle('window:expand', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('app:expand');
  }
});

ipcMain.handle('app:getPendingRegistrationDrive', () => {
  const pending = appState.pendingRegistrationDrive || pendingRegistrationDrive;
  console.log(`[IPC] [${new Date().toISOString()}] app:getPendingRegistrationDrive requested: ${pending ? `${pending.driveLetter} (${pending.stableHardwareId || pending.volumeLabel})` : 'null'}`);
  return pending;
});

ipcMain.handle('app:clearPendingRegistrationDrive', () => {
  console.log(`[IPC] [${new Date().toISOString()}] app:clearPendingRegistrationDrive called`);
  appState.pendingRegistrationDrive = null;
  pendingRegistrationDrive = null;
  lastUnregisteredDrive = null;
  syncTrayState('clearPendingRegistrationDrive');
  return true;
});

ipcMain.handle('app:dismissRegistration', (_event, stableHardwareId) => {
  console.log(`[IPC] [${new Date().toISOString()}] app:dismissRegistration called for: ${stableHardwareId || 'current'}`);
  if (appState.pendingRegistrationDrive && (!stableHardwareId || appState.pendingRegistrationDrive.stableHardwareId === stableHardwareId)) {
    appState.pendingRegistrationDrive = null;
    pendingRegistrationDrive = null;
    lastUnregisteredDrive = null;
  }
  syncTrayState('user-explicit-dismissal');
  return true;
});

ipcMain.handle('tray:notify', (_event, opts) => {
  showTrayNotification(opts);
});

ipcMain.handle('app:quit', () => {
  app.isQuitting = true;
  app.quit();
});

// Windows Startup Registration & Query Helpers
function getWindowsStartupStatus() {
  const isPackaged = app.isPackaged;
  const exePath = app.getPath('exe');
  if (process.platform === 'win32') {
    try {
      const settings = app.getLoginItemSettings({
        path: exePath,
        args: ['--hidden'],
      });
      return {
        enabled: Boolean(settings.openAtLogin),
        status: settings.openAtLogin ? 'registered' : 'unregistered',
        executablePath: exePath,
        launchArgs: ['--hidden'],
        wasOpenedAtLogin: Boolean(settings.wasOpenedAtLogin),
        wasOpenedAsHidden: Boolean(settings.wasOpenedAsHidden),
        isPackaged,
      };
    } catch (err) {
      console.warn(`[Startup] Failed to query Windows login item settings: ${err.message}`);
    }
  }
  return {
    enabled: true,
    status: 'registered',
    executablePath: exePath,
    launchArgs: ['--hidden'],
    wasOpenedAtLogin: false,
    wasOpenedAsHidden: false,
    isPackaged,
  };
}

function syncWindowsStartupRegistration(enabled = true) {
  const isPackaged = app.isPackaged;
  const exePath = app.getPath('exe');
  console.log(`[Startup] [${new Date().toISOString()}] Synchronizing Windows startup registration: enabled=${enabled}, isPackaged=${isPackaged}, exePath="${exePath}"`);

  if (process.platform === 'win32') {
    try {
      app.setLoginItemSettings({
        openAtLogin: Boolean(enabled),
        openAsHidden: true,
        path: exePath,
        args: ['--hidden'],
      });
      const check = app.getLoginItemSettings({
        path: exePath,
        args: ['--hidden'],
      });
      console.log(`[Startup] [${new Date().toISOString()}] Windows login item updated successfully: openAtLogin=${check.openAtLogin}`);
      return {
        enabled: Boolean(check.openAtLogin),
        status: check.openAtLogin ? 'registered' : 'unregistered',
        executablePath: exePath,
        launchArgs: ['--hidden'],
        isPackaged,
      };
    } catch (err) {
      console.error(`[Startup] [${new Date().toISOString()}] Error updating Windows login item: ${err.message}`);
      return {
        enabled: false,
        status: 'error',
        executablePath: exePath,
        launchArgs: ['--hidden'],
        error: err.message,
        isPackaged,
      };
    }
  }

  return {
    enabled: Boolean(enabled),
    status: enabled ? 'registered' : 'unregistered',
    executablePath: exePath,
    launchArgs: ['--hidden'],
    isPackaged,
  };
}

function checkIsAutoStartLaunch() {
  const args = process.argv || [];
  const hasHiddenFlag = args.includes('--hidden') || args.includes('--autostart') || args.includes('--minimized');
  let openedAsHidden = false;
  if (process.platform === 'win32') {
    try {
      const loginSettings = app.getLoginItemSettings();
      openedAsHidden = Boolean(loginSettings && (loginSettings.wasOpenedAsHidden || loginSettings.wasOpenedAtLogin));
    } catch {}
  }
  const isAuto = Boolean(hasHiddenFlag || openedAsHidden);
  console.log(`[Startup] [${new Date().toISOString()}] Launch mode: isAutoStartLaunch=${isAuto} (hasHiddenFlag=${hasHiddenFlag}, openedAsHidden=${openedAsHidden}, argv=${JSON.stringify(args)})`);
  return isAuto;
}

ipcMain.handle('system:get-startup-status', () => {
  return getWindowsStartupStatus();
});

ipcMain.handle('system:set-startup-status', async (_event, enabled) => {
  const res = syncWindowsStartupRegistration(enabled);
  try {
    const postData = JSON.stringify({ enabled: Boolean(enabled) });
    const req = http.request({
      hostname: '127.0.0.1',
      port: SERVER_PORT,
      path: '/api/system/startup',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 2000,
    }, () => {});
    req.on('error', (err) => console.warn(`[Main] /api/system/startup sync error: ${err.message}`));
    req.write(postData);
    req.end();
  } catch (err) {
    console.warn(`[Main] Failed to broadcast startup status update to backend: ${err.message}`);
  }
  return res;
});




// Check if local server is already running
function pingServer(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/drives`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Request immediate drive rescan with bounded retries for mounting stabilization
function requestDriveRescan(port, source = 'native-ipc', driveLetter = null) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ source, driveLetter });
    console.log(`[Main] [${new Date().toISOString()}] calling rescan: POST /api/drives/rescan (source: ${source}, driveLetter: ${driveLetter || 'none'})`);
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/drives/rescan',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-Rescan-Source': source,
      },
      timeout: 8000,
    }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          console.log(`[Main] [${new Date().toISOString()}] received response: status=${res.statusCode}, count=${parsed.count ?? 0}`);
          resolve(parsed);
        } catch {
          console.log(`[Main] [${new Date().toISOString()}] received response: non-JSON (status=${res.statusCode})`);
          resolve({ success: res.statusCode === 200, count: 0 });
        }
      });
    });
    req.on('error', (err) => {
      console.log(`[Main] [${new Date().toISOString()}] Rescan request error: ${err.message}`);
      resolve({ success: false, count: 0 });
    });
    req.on('timeout', () => {
      console.log(`[Main] [${new Date().toISOString()}] Rescan request timed out after 8s`);
      req.destroy();
      resolve({ success: false, count: 0 });
    });
    req.write(postData);
    req.end();
  });
}

// Track current tray tooltip state reliably (since tray.getToolTip is not an Electron API)
let currentTrayTooltip = 'Dero Vault — Idle (Waiting for USB drive)';

/**
 * Centralized store updater with deduplication by letter and serial
 */
function addOrUpdateConnectedDrive(drive) {
  if (!drive || !drive.stableHardwareId) return;

  // Reconcile and deduplicate: if an entry already exists with the same driveLetter or volumeSerial,
  // clean up the old key to prevent duplicate dangling records.
  for (const [existingId, d] of Array.from(appState.connectedDrives.entries())) {
    const isSameLetter = d.driveLetter && drive.driveLetter && d.driveLetter.toUpperCase() === drive.driveLetter.toUpperCase();
    const isSameSerial = d.volumeSerial && drive.volumeSerial && d.volumeSerial !== 'UNKNOWN' && d.volumeSerial === drive.volumeSerial;
    if ((isSameLetter || isSameSerial) && existingId !== drive.stableHardwareId) {
      console.log(`[State] [${new Date().toISOString()}] Reconciling connected drive: replacing old key "${existingId}" with new "${drive.stableHardwareId}"`);
      appState.connectedDrives.delete(existingId);
    }
  }

  appState.connectedDrives.set(drive.stableHardwareId, drive);
}

/**
 * Requirement 8: On device removal, match by persistent identity and verify physical absence.
 */
function removeDeviceFromState(deviceIdentifier, reason) {
  const fs = require('fs');
  const target = deviceIdentifier ? String(deviceIdentifier).toUpperCase() : null;
  console.log(`[State] [${new Date().toISOString()}] removeDeviceFromState called for: ${deviceIdentifier || 'unspecified'} (reason: ${reason})`);

  for (const [id, d] of Array.from(appState.connectedDrives.entries())) {
    const cleanLetter = d.driveLetter ? d.driveLetter.replace(':', '').toUpperCase() : '';
    const cleanTarget = target ? target.replace(':', '').toUpperCase() : '';
    const idMatch = target && (id.toUpperCase() === target || (d.stableHardwareId && d.stableHardwareId.toUpperCase() === target));
    const letterMatch = cleanTarget && cleanLetter && cleanLetter === cleanTarget;
    const serialMatch = target && d.volumeSerial && d.volumeSerial.toUpperCase() === target;

    const match = Boolean(idMatch || letterMatch || serialMatch || (!target));

    if (match) {
      let physicallyPresent = false;
      if (d.mountPath) {
        try {
          physicallyPresent = fs.existsSync(d.mountPath);
        } catch {
          physicallyPresent = false;
        }
      }

      // If Windows explicitly reported removal (e.g. 0x8004) or the mount path is gone
      const isExplicitRemoval = reason && reason.includes('0x8004');
      if (!physicallyPresent || isExplicitRemoval) {
        console.log(`[State] [${new Date().toISOString()}] Disconnect confirmed for ${d.driveLetter} (${d.stableHardwareId}). Removing from authoritative state.`);
        appState.connectedDrives.delete(id);
        if (appState.pendingRegistrationDrive && (
          appState.pendingRegistrationDrive.stableHardwareId === d.stableHardwareId ||
          appState.pendingRegistrationDrive.driveLetter === d.driveLetter
        )) {
          appState.pendingRegistrationDrive = null;
          pendingRegistrationDrive = null;
          lastUnregisteredDrive = null;
        }
        // Reset balloon debounce so re-inserting the same device will notify immediately
        lastBalloonContent = '';
        lastBalloonTime = 0;
      } else {
        console.log(`[State] [${new Date().toISOString()}] Ignored removal for ${d.driveLetter} (${d.stableHardwareId}): Drive is still physically mounted at ${d.mountPath}!`);
      }
    }
  }

  syncTrayState(`removeDevice: ${reason}`);
}

/**
 * Single authoritative tray state synchronizer.
 * Enforces requirement 7: Returns tray to IDLE ONLY when there are no connected
 * eligible drives that require action, no pending registration, and no active backup.
 * Requirement 9: Logs every transition with new state, reason, connected-drive count,
 * and pending-registration identity.
 */
function syncTrayState(reason) {
  const fs = require('fs');

  // Verify connected drives physical existence before state calculation
  for (const [id, d] of Array.from(appState.connectedDrives.entries())) {
    if (d.mountPath) {
      try {
        if (!fs.existsSync(d.mountPath)) {
          console.log(`[TraySync] [${new Date().toISOString()}] Drive ${d.driveLetter} (${id}) is no longer physically mounted at ${d.mountPath}. Removing.`);
          appState.connectedDrives.delete(id);
          if (appState.pendingRegistrationDrive && (appState.pendingRegistrationDrive.stableHardwareId === id || appState.pendingRegistrationDrive.driveLetter === d.driveLetter)) {
            appState.pendingRegistrationDrive = null;
            pendingRegistrationDrive = null;
            lastUnregisteredDrive = null;
          }
        }
      } catch {}
    }
  }

  // Also verify pending registration drive physical existence
  if (appState.pendingRegistrationDrive && appState.pendingRegistrationDrive.mountPath) {
    try {
      if (!fs.existsSync(appState.pendingRegistrationDrive.mountPath)) {
        console.log(`[TraySync] [${new Date().toISOString()}] Pending registration drive ${appState.pendingRegistrationDrive.driveLetter} is no longer physically mounted. Clearing.`);
        appState.pendingRegistrationDrive = null;
        pendingRegistrationDrive = null;
        lastUnregisteredDrive = null;
      }
    } catch {}
  }

  const connectedCount = appState.connectedDrives.size;
  const pendingId = appState.pendingRegistrationDrive ? appState.pendingRegistrationDrive.stableHardwareId : 'none';
  const pendingLetter = appState.pendingRegistrationDrive ? appState.pendingRegistrationDrive.driveLetter : '';

  let newStatus = '';

  // 1. If an active backup is running
  if (appState.activeBackup) {
    const b = appState.activeBackup;
    if (b.status === 'checking_capacity') {
      newStatus = `Dero Vault — Checking destination capacity (${b.driveName || 'removable drive'})...`;
    } else if (b.filesProcessed !== undefined && b.totalFiles !== undefined) {
      newStatus = `Dero Vault — Backing up ${b.driveName || 'removable drive'}: ${b.filesProcessed}/${b.totalFiles} (${b.progress || 0}%)...`;
    } else {
      newStatus = `Dero Vault — Backing up ${b.driveName || 'removable drive'}...`;
    }
  }
  // 2. Transient status (e.g. stopped for insufficient capacity, interrupted, error)
  else if (appState.transientStatus && Date.now() < appState.transientExpiry && !appState.pendingRegistrationDrive) {
    newStatus = appState.transientStatus;
  }
  // 3. If an unregistered drive is pending registration
  // Requirement 6: Keep the registration prompt available until registered, dismissed, or physically removed.
  else if (appState.pendingRegistrationDrive) {
    const drive = appState.pendingRegistrationDrive;
    newStatus = `Dero Vault — New USB drive detected (${drive.driveLetter})`;
  }
  // 4. If connected drives exist in the authoritative store
  else if (connectedCount > 0) {
    const drives = Array.from(appState.connectedDrives.values());
    const regDrive = drives.find((d) => d.isRegistered);
    if (regDrive) {
      newStatus = `Dero Vault — Protected (${regDrive.friendlyName || regDrive.volumeLabel} [${regDrive.driveLetter}])`;
    } else {
      const unreg = drives.find((d) => !d.isRegistered);
      if (unreg) {
        appState.pendingRegistrationDrive = unreg;
        pendingRegistrationDrive = unreg;
        lastUnregisteredDrive = unreg;
        newStatus = `Dero Vault — New USB drive detected (${unreg.driveLetter})`;
      } else {
        newStatus = 'Dero Vault — Idle (Waiting for USB drive)';
      }
    }
  }
  // 5. Requirement 7: Return to IDLE only when no connected drives, no pending registration, no active backup
  else {
    newStatus = 'Dero Vault — Idle (Waiting for USB drive)';
  }

  const previousStatus = currentTrayTooltip;
  currentTrayTooltip = newStatus;

  if (tray) {
    try {
      tray.setToolTip(newStatus);
    } catch (err) {
      console.error(`[Tray] [${new Date().toISOString()}] setToolTip error: ${err.message}`);
    }
  }

  // Requirement 9: Timestamped logs with new state, reason, connected count, and pending registration identity
  console.log(`[TrayTransition] [${new Date().toISOString()}] state="${newStatus}" | reason="${reason}" | connectedCount=${connectedCount} | pendingRegistration="${pendingId}" [${pendingLetter}] (changed=${previousStatus !== newStatus})`);

  if (typeof updateTrayContextMenu === 'function') {
    updateTrayContextMenu();
  }
}

function setTrayStatus(text, reason = 'setTrayStatus') {
  if (text.includes('Detecting') || text.includes('Scanning') || text.includes('failed')) {
    if (!appState.pendingRegistrationDrive && !appState.activeBackup) {
      appState.transientStatus = text;
      appState.transientExpiry = Date.now() + 2500;
    }
  }
  syncTrayState(`${reason}: ${text}`);
}


// Subscribe Electron Main Process directly to Backend SSE Stream
// Ensures the System Tray reacts reliably to drive & backup events even when renderer is closed or minimized
let lastBalloonContent = '';
let lastBalloonTime = 0;

/**
 * Opens and focuses the application window, expanding from tray and opening
 * the Drive Registration/Configuration modal for the specified drive.
 * Retains pending drive state if the renderer is still loading.
 */
function openRegistrationForDrive(drive) {
  const targetDrive = drive || lastUnregisteredDrive;
  console.log(`[MainAction] [${new Date().toISOString()}] openRegistrationForDrive invoked for drive: ${targetDrive ? `${targetDrive.driveLetter} (${targetDrive.stableHardwareId || targetDrive.volumeLabel})` : 'null'}`);

  if (targetDrive) {
    lastUnregisteredDrive = targetDrive;
    pendingRegistrationDrive = targetDrive;
    appState.pendingRegistrationDrive = targetDrive;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    console.log(`[MainAction] Re-creating mainWindow because it was destroyed or null`);
    createWindow();
  }

  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      console.log(`[MainAction] Restoring minimized mainWindow.`);
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();

    const dispatchEvents = () => {
      try {
        console.log(`[MainAction] Dispatching app:expand and drive:open-registration to renderer for: ${targetDrive ? targetDrive.driveLetter : 'none'}`);
        mainWindow.webContents.send('app:expand');
        if (targetDrive) {
          mainWindow.webContents.send('drive:open-registration', targetDrive);
        }
      } catch (err) {
        console.error(`[MainAction] Error dispatching IPC events to renderer: ${err.message}`);
      }
    };

    if (mainWindow.webContents.isLoading()) {
      console.log(`[MainAction] Renderer is still loading. Queuing open-registration event on did-finish-load.`);
      mainWindow.webContents.once('did-finish-load', () => {
        setTimeout(dispatchEvents, 100);
      });
    } else {
      dispatchEvents();
      setTimeout(dispatchEvents, 100);
      setTimeout(dispatchEvents, 300);
      setTimeout(dispatchEvents, 600);
    }
  }
}

/**
 * Shows desktop notification using Electron Notification API (primary, full click support)
 * with tray.displayBalloon as secondary fallback.
 */
// Retain active notification references to prevent V8 garbage collection on Windows
const activeNotifications = [];

function showTrayNotification(opts) {
  const { title = 'Dero Vault', content = '', type = 'info', drive = null, onClick = null } = opts || {};
  const now = Date.now();
  if (content === lastBalloonContent && (now - lastBalloonTime) < 1500) {
    return; // Prevent duplicate notification spam
  }
  lastBalloonContent = content;
  lastBalloonTime = now;

  // If the main window is already open, focused and active in the foreground, suppress redundant OS toasts
  const isForegroundActive = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && mainWindow.isFocused() && !mainWindow.isMinimized();
  if (isForegroundActive) {
    console.log(`[Notification] [${new Date().toISOString()}] Main window is focused in foreground; suppressing redundant OS toast: "${content}"`);
    return;
  }

  const clickHandler = () => {
    console.log(`[Notification] [${new Date().toISOString()}] Notification clicked by user: "${content}"`);
    if (typeof onClick === 'function') {
      onClick();
    } else if (drive || lastUnregisteredDrive || appState.pendingRegistrationDrive) {
      openRegistrationForDrive(drive || lastUnregisteredDrive || appState.pendingRegistrationDrive);
    } else {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('app:expand');
      }
    }
  };

  // Primary: Native Windows Toast Notification via Electron Notification API with full click support
  if (Notification && Notification.isSupported()) {
    try {
      const icoPath = path.join(__dirname, 'assets', 'icon.ico');
      const pngPath = path.join(__dirname, 'assets', 'icon.png');
      const fs = require('fs');
      const iconPath = fs.existsSync(icoPath) ? icoPath : pngPath;

      const notification = new Notification({
        title,
        body: content,
        icon: iconPath,
        urgency: type === 'error' ? 'critical' : 'normal',
      });

      notification.on('click', clickHandler);
      notification.on('action', clickHandler);
      notification.on('close', () => {
        console.log(`[Notification] [${new Date().toISOString()}] Notification closed`);
      });

      // Keep reference alive so GC doesn't collect native WinRT toast callback
      activeNotifications.push(notification);
      if (activeNotifications.length > 8) {
        activeNotifications.shift();
      }

      notification.show();
      console.log(`[Notification] [${new Date().toISOString()}] Native toast shown: "${content}" (click handler attached: true)`);
      return;
    } catch (notifErr) {
      console.warn(`[Notification] Native Notification failed, falling back to tray balloon: ${notifErr.message}`);
    }
  }

  // Fallback to tray balloon
  if (tray) {
    try {
      tray.displayBalloon({
        iconType: type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info',
        title,
        content,
      });
      console.log(`[Tray] [${new Date().toISOString()}] Tray balloon shown: "${content}"`);
    } catch (err) {
      console.log(`[Tray] [${new Date().toISOString()}] displayBalloon failed: ${err.message}`);
    }
  }
}

const sseHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 5, keepAliveMsecs: 10000 });

function subscribeToBackendEvents() {
  console.log(`[Tray] [${new Date().toISOString()}] Connecting main process to backend event stream (SSE)...`);
  const req = http.get({
    hostname: '127.0.0.1',
    port: SERVER_PORT,
    path: '/api/events',
    agent: sseHttpAgent,
    headers: {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  }, (res) => {
    let buffer = '';
    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        if (!part.trim()) continue;
        const eventMatch = part.match(/^event:\s*(.+)$/m);
        const dataMatch = part.match(/^data:\s*(.+)$/m);
        if (eventMatch && dataMatch) {
          const eventType = eventMatch[1].trim();
          let data = null;
          try {
            data = JSON.parse(dataMatch[1].trim());
          } catch {}
          handleBackendStateChange(eventType, data);
        }
      }
    });
    res.on('end', () => {
      console.log(`[Tray] [${new Date().toISOString()}] SSE connection closed by backend. Reconnecting in 2s...`);
      setTimeout(subscribeToBackendEvents, 2000);
    });
  });

  req.setTimeout(0);
  req.on('error', (err) => {
    console.log(`[Tray] [${new Date().toISOString()}] SSE connection error: ${err.message}. Retrying in 2s...`);
    setTimeout(subscribeToBackendEvents, 2000);
  });
}

let lastTerminalSessionId = null;

function handleTerminalBackupEvent(data, source) {
  if (!data) return;
  const sessionId = data.id || `${data.startTime}_${data.status}`;
  if (lastTerminalSessionId === sessionId) {
    console.log(`[Tray] [${new Date().toISOString()}] Terminal state for session ${sessionId} already handled; skipping duplicate.`);
    return;
  }
  lastTerminalSessionId = sessionId;

  console.log(`[Tray] [${new Date().toISOString()}] Handling terminal backup state via ${source}: ${data.status}`);
  appState.activeBackup = null;

  if (data.status === 'completed' && data.isVerified) {
    appState.transientStatus = null;
    syncTrayState('backup:completed');
    showTrayNotification({
      title: 'Dero Vault',
      content: "✓ Today's work is safely backed up.",
      type: 'info',
    });
  } else if (data.status === 'incomplete' || data.status === 'completed_with_errors' || data.status === 'completed_with_warnings' || (data.status === 'completed' && !data.isVerified)) {
    const failCount = data.errors?.length || data.filesFailed || 1;
    appState.transientStatus = `Dero Vault — Backup incomplete (${failCount} unverified or failed)`;
    appState.transientExpiry = Date.now() + 15000;
    syncTrayState('backup:incomplete');
    showTrayNotification({
      title: 'Dero Vault — Backup Incomplete',
      content: `Backup finished with ${failCount} unverified or missing file(s). Data integrity not verified.`,
      type: 'warning',
      onClick: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('app:expand');
        }
      },
    });
  } else if (data.status === 'stopped_insufficient_space') {
    const req = data.capacityAssessment?.formattedRequired || 'more storage';
    const avail = data.capacityAssessment?.formattedAvailable || 'available storage';
    appState.transientStatus = `Dero Vault — Destination Capacity Insufficient (${data.driveName || 'USB drive'})`;
    appState.transientExpiry = Date.now() + 15000;
    syncTrayState('backup:stopped_insufficient_space');
    showTrayNotification({
      title: 'Dero Vault — Insufficient Storage',
      content: `Backup stopped safely: Destination needs ${req} but only ${avail} is available. Zero files copied.`,
      type: 'warning',
      onClick: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('app:expand');
        }
      },
    });
  } else if (data.status === 'interrupted') {
    appState.transientStatus = `Dero Vault — Backup interrupted (Drive disconnected)`;
    appState.transientExpiry = Date.now() + 15000;
    syncTrayState('backup:interrupted');
    showTrayNotification({
      title: 'Dero Vault — Backup Interrupted',
      content: 'The backup drive was disconnected before copying finished.',
      type: 'error',
    });
  } else if (data.status === 'failed' || data.status === 'cancelled') {
    appState.transientStatus = `Dero Vault — Backup ${data.status}`;
    appState.transientExpiry = Date.now() + 15000;
    syncTrayState(`backup:${data.status}`);
    showTrayNotification({
      title: 'Dero Vault — Backup Failed',
      content: data.errors?.[0]?.error || `The backup could not be completed (${data.status}).`,
      type: 'error',
    });
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('backup:complete', data);
  }
}

function handleBackendStateChange(eventType, data) {
  console.log(`[Backend] [${new Date().toISOString()}] State change event received: ${eventType}`);

  if (eventType === 'drive:connected' && data) {
    const drive = data;
    if (drive.partial || drive.reason === 'detection-timeout') {
      console.log(`[Tray] [${new Date().toISOString()}] Partial classification for drive ${drive.driveLetter}. Setting FAILED terminal state.`);
      setTrayStatus(`Dero Vault — Detection failed for USB (${drive.driveLetter}) – click to retry`, 'partial-timeout');
      showTrayNotification({
        title: 'Dero Vault',
        content: `USB drive detected (${drive.driveLetter}), but classification timed out. Click tray icon to retry.`,
        type: 'warning',
      });
      return;
    }

    // Update authoritative connected drives
    addOrUpdateConnectedDrive(drive);

    if (drive.isRegistered) {
      console.log(`[Tray] [${new Date().toISOString()}] Registered drive connected (${drive.driveLetter}). Setting REGISTERED state.`);
      if (appState.pendingRegistrationDrive?.stableHardwareId === drive.stableHardwareId) {
        appState.pendingRegistrationDrive = null;
        pendingRegistrationDrive = null;
        lastUnregisteredDrive = null;
      }
      showTrayNotification({
        title: 'Dero Vault',
        content: `Registered drive "${drive.friendlyName || drive.volumeLabel}" connected. Automatic backup starting.`,
      });
      syncTrayState(`drive:connected (registered: ${drive.driveLetter})`);
    } else {
      console.log(`[Tray] [${new Date().toISOString()}] Unregistered drive detected (${drive.driveLetter}). Setting UNREGISTERED pending state.`);
      appState.pendingRegistrationDrive = drive;
      pendingRegistrationDrive = drive;
      lastUnregisteredDrive = drive;
      showTrayNotification({
        title: 'Dero Vault',
        content: `New removable storage: ${drive.volumeLabel || 'Disk'} (${drive.driveLetter}). Click to configure.`,
        drive,
        onClick: () => openRegistrationForDrive(drive),
      });
      syncTrayState(`drive:connected (unregistered: ${drive.driveLetter})`);
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('drive:connected', drive);
    }
  } else if (eventType === 'drive:unregistered_detected' && data) {
    const drive = data;
    if (drive.partial || drive.reason === 'detection-timeout') {
      return; // Handled above
    }
    console.log(`[Tray] [${new Date().toISOString()}] Unregistered drive detected (${drive.driveLetter}). Storing in authoritative state.`);
    addOrUpdateConnectedDrive(drive);
    appState.pendingRegistrationDrive = drive;
    pendingRegistrationDrive = drive;
    lastUnregisteredDrive = drive;
    showTrayNotification({
      title: 'Dero Vault',
      content: `New removable storage: ${drive.volumeLabel || 'Disk'} (${drive.driveLetter}). Click to configure.`,
      drive,
      onClick: () => openRegistrationForDrive(drive),
    });
    syncTrayState(`drive:unregistered_detected (${drive.driveLetter})`);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('drive:unregistered_detected', drive);
    }
  } else if (eventType === 'drive:registered' && data) {
    const stableId = data.stableHardwareId;
    console.log(`[Main] [${new Date().toISOString()}] Drive ${stableId || 'unknown'} registered.`);
    for (const [id, d] of appState.connectedDrives.entries()) {
      if (id === stableId || d.driveLetter === data.driveLetter) {
        d.isRegistered = true;
        d.friendlyName = data.friendlyName || d.friendlyName;
      }
    }
    if (appState.pendingRegistrationDrive && (!stableId || appState.pendingRegistrationDrive.stableHardwareId === stableId || appState.pendingRegistrationDrive.driveLetter === data.driveLetter)) {
      appState.pendingRegistrationDrive = null;
      pendingRegistrationDrive = null;
      lastUnregisteredDrive = null;
    }
    syncTrayState(`drive:registered (${stableId || data.driveLetter})`);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('drive:registered', data);
    }
  } else if (eventType === 'drive:ignored' && data) {
    const letter = data.driveLetter || 'drive';
    console.log(`[Tray] [${new Date().toISOString()}] Ignored device (${letter}): Setting IGNORED state.`);
    setTrayStatus(`Dero Vault — Not a backup target (${letter})`, 'drive:ignored');
    showTrayNotification({
      title: 'Dero Vault',
      content: `Storage device (${letter}) is not a backup target.`,
      type: 'info',
    });
  } else if (eventType === 'drive:failed' && data) {
    console.log(`[Tray] [${new Date().toISOString()}] Detection failed for device: Setting FAILED state.`);
    setTrayStatus('Dero Vault — Detection failed – click to retry', 'drive:failed');
  } else if (eventType === 'drive:disconnected' && data) {
    const drive = data;
    console.log(`[Tray] [${new Date().toISOString()}] Storage device disconnected event for ${drive.driveLetter} (${drive.stableHardwareId})`);
    removeDeviceFromState(drive.stableHardwareId || drive.driveLetter, 'sse:drive:disconnected');

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('drive:disconnected', drive);
    }
  } else if ((eventType === 'backup:start' || eventType === 'backup:catchup') && data) {
    const isTerminal = ['completed', 'completed_with_errors', 'failed', 'cancelled', 'interrupted', 'stopped_insufficient_space', 'incomplete'].includes(data.status);
    if (isTerminal) {
      handleTerminalBackupEvent(data, eventType);
    } else {
      const totalFiles = (data.newFilesCount || 0) + (data.modifiedFilesCount || 0) || data.filesScanned || 0;
      const filesProcessed = (data.filesCopied || 0) + (data.filesSkipped || 0);
      const progress = data.bytesTotal > 0
        ? Math.round((data.bytesTransferred / data.bytesTotal) * 100)
        : (totalFiles > 0 ? Math.round((filesProcessed / totalFiles) * 100) : 0);

      appState.activeBackup = {
        status: data.status || 'running',
        driveName: data.driveName,
        filesProcessed,
        totalFiles,
        progress,
      };
      syncTrayState(`backup:start (${data.driveName})`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backup:update', data);
      }
    }
  } else if (eventType === 'backup:update' && data) {
    const isTerminal = ['completed', 'completed_with_errors', 'failed', 'cancelled', 'interrupted', 'stopped_insufficient_space', 'incomplete'].includes(data.status);
    if (isTerminal) {
      handleTerminalBackupEvent(data, 'backup:update');
    } else {
      const totalFiles = (data.newFilesCount || 0) + (data.modifiedFilesCount || 0) || data.filesScanned || 0;
      const filesProcessed = (data.filesCopied || 0) + (data.filesSkipped || 0);
      const progress = data.bytesTotal > 0
        ? Math.round((data.bytesTransferred / data.bytesTotal) * 100)
        : (totalFiles > 0 ? Math.round((filesProcessed / totalFiles) * 100) : 0);

      appState.activeBackup = {
        status: data.status || 'running',
        driveName: data.driveName,
        filesProcessed,
        totalFiles,
        progress,
      };
      syncTrayState(`backup:update (${data.driveName}: ${progress}%)`);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backup:update', data);
      }
    }
  } else if (eventType === 'backup:complete' && data) {
    handleTerminalBackupEvent(data, 'backup:complete');
  } else if (eventType === 'reminder:due' && data) {
    console.log(`[Notification] [${new Date().toISOString()}] Backup reminder due: ${data.message}`);
    showTrayNotification({
      title: 'Dero Vault — Backup Reminder',
      content: data.message || "Time to plug in your vault drive and secure your work.",
      type: 'info',
      onClick: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      },
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('reminder:due', data);
    }
  } else if (eventType === 'reminder:status' && data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('reminder:status', data);
    }
  } else if (eventType === 'startup:updated' && data) {
    console.log(`[Main] [${new Date().toISOString()}] Startup setting broadcast received: enabled=${data.enabled}`);
    syncWindowsStartupRegistration(data.enabled);
    if (updateTrayContextMenu) {
      updateTrayContextMenu();
    }
  }
}



// Start embedded backend server
async function ensureServerRunning() {
  const isRunning = await pingServer(SERVER_PORT);
  if (isRunning) {
    console.log(`[Main] [${new Date().toISOString()}] Server already running on port ${SERVER_PORT}`);
    return;
  }

  // 1. Direct in-process startup using CommonJS bundle (works 100% reliably in dev AND inside app.asar)
  const cjsServerPath = path.join(__dirname, '..', 'dist-server', 'server.cjs');
  console.log(`[Main] [${new Date().toISOString()}] Starting embedded Dero Vault server in-process: ${cjsServerPath}`);

  try {
    const serverModule = require(cjsServerPath);
    if (serverModule && typeof serverModule.createDeroVaultServer === 'function') {
      await serverModule.createDeroVaultServer(SERVER_PORT, {
        onEvent: (eventType, data) => {
          handleBackendStateChange(eventType, data);
        },
      });
      console.log(`[Main] [${new Date().toISOString()}] Embedded server successfully started in-process with direct event bridge on port ${SERVER_PORT}`);
      return;
    }
  } catch (cjsErr) {
    console.warn(`[Main] [${new Date().toISOString()}] In-process require('${cjsServerPath}') threw: ${cjsErr.message}. Trying ESM fallback.`);
  }

  // 2. Fallback: Start server in-process via dynamic import of ESM bundle
  const esmServerPath = path.join(__dirname, '..', 'dist-server', 'server.mjs');
  try {
    const { pathToFileURL } = require('url');
    const serverModuleUrl = pathToFileURL(esmServerPath).href;
    const serverModule = await import(serverModuleUrl);
    if (serverModule && typeof serverModule.createDeroVaultServer === 'function') {
      await serverModule.createDeroVaultServer(SERVER_PORT, {
        onEvent: (eventType, data) => {
          handleBackendStateChange(eventType, data);
        },
      });
      console.log(`[Main] [${new Date().toISOString()}] Embedded server successfully started via ESM import with direct event bridge on port ${SERVER_PORT}`);
      return;
    }
  } catch (inProcErr) {
    console.error(`[Main] [${new Date().toISOString()}] In-process server startup error: ${inProcErr.message}`);
  }

  // 3. Fallback: Child process fork
  try {
    serverProcess = fork(esmServerPath, [], {
      execPath: process.execPath,
      env: {
        ...process.env,
        PORT: String(SERVER_PORT),
        NODE_ENV: 'production',
        ELECTRON_RUN_AS_NODE: '1',
        START_SERVER_IMMEDIATELY: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (serverProcess.stdout) {
      serverProcess.stdout.on('data', (data) => {
        process.stdout.write(`[ServerOut] ${data}`);
      });
    }
    if (serverProcess.stderr) {
      serverProcess.stderr.on('data', (data) => {
        process.stderr.write(`[ServerErr] ${data}`);
      });
    }
    serverProcess.on('exit', (code, sig) => {
      console.log(`[Main] [${new Date().toISOString()}] Embedded server process exited with code ${code}, signal ${sig}`);
    });
  } catch (forkErr) {
    console.warn(`[Main] [${new Date().toISOString()}] Fork failed: ${forkErr.message}.`);
  }

  // Final confirmation
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await pingServer(SERVER_PORT)) {
      console.log(`[Main] [${new Date().toISOString()}] Embedded server is ready on port ${SERVER_PORT}.`);
      return;
    }
  }

  console.warn(`[Main] [${new Date().toISOString()}] Server took longer than expected to report ready on port ${SERVER_PORT}.`);
}

function createWindow(explicitShow) {
  const isAutoStart = checkIsAutoStartLaunch();
  const shouldShow = explicitShow !== undefined ? Boolean(explicitShow) : !isAutoStart;
  console.log(`[Main] [${new Date().toISOString()}] Creating main window: shouldShow=${shouldShow} (isAutoStartLaunch=${isAutoStart})`);

  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  // Remove redundant native File, Edit, View, Window menu bar completely
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: shouldShow,
    title: 'Dero Vault™ — Your Digital Granary | A product of Enen Digital Labs™',
    icon: icon.isEmpty() ? undefined : icon,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#020617', // Slate-950
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // Prevent blank windows: open external links in system browser and deny internal popups
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
      try {
        shell.openExternal(url);
      } catch (err) {
        console.warn(`[Main] Failed to open external URL: ${url}`, err);
      }
    }
    return { action: 'deny' };
  });

  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:state-changed', { isMaximized: true });
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:state-changed', { isMaximized: false });
    }
  });

  const appUrl = `http://127.0.0.1:${SERVER_PORT}`;

  mainWindow.webContents.on('did-finish-load', () => {
    console.log(`[Main] [${new Date().toISOString()}] did-finish-load: URL=${mainWindow.webContents.getURL()}`);
  });

  mainWindow.webContents.on('dom-ready', () => {
    console.log(`[Main] [${new Date().toISOString()}] dom-ready: DOM content parsed for ${mainWindow.webContents.getURL()}`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[Main] [${new Date().toISOString()}] render-process-gone: reason=${details.reason}, exitCode=${details.exitCode}`);
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn(`[Main] [${new Date().toISOString()}] Renderer window became unresponsive`);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levelName = level === 3 ? 'ERROR' : level === 2 ? 'WARN' : 'INFO';
    console.log(`[RendererConsole] [${levelName}] ${message} (${path.basename(sourceId || '')}:${line})`);
  });

  function resolveLocalIndexHtml() {
    const fs = require('fs');
    const localIndexCandidates = [
      path.join(__dirname, '..', 'dist', 'index.html'),
      path.join(process.cwd(), 'dist', 'index.html'),
      path.join(app.getAppPath(), 'dist', 'index.html'),
      ...(process.resourcesPath ? [
        path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html'),
        path.join(process.resourcesPath, 'app', 'dist', 'index.html'),
        path.join(process.resourcesPath, 'dist', 'index.html'),
      ] : []),
    ];
    for (const p of localIndexCandidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return null;
  }

  const localIndexPath = resolveLocalIndexHtml();

  if (app.isPackaged && localIndexPath) {
    console.log(`[Main] [${new Date().toISOString()}] Packaged application detected: loading local production bundle: ${localIndexPath}`);
    mainWindow.loadFile(localIndexPath).catch((err) => {
      console.error(`[Main] [${new Date().toISOString()}] loadFile failed: ${err.message}. Trying ${appUrl}`);
      mainWindow.loadURL(appUrl);
    });
  } else {
    console.log(`[Main] [${new Date().toISOString()}] Loading renderer from ${appUrl}`);
    mainWindow.loadURL(appUrl).catch((err) => {
      console.warn(`[Main] [${new Date().toISOString()}] Initial loadURL failed: ${err.message}. Attempting local file fallback...`);
      if (localIndexPath) {
        console.log(`[Main] [${new Date().toISOString()}] Loading local file fallback: ${localIndexPath}`);
        mainWindow.loadFile(localIndexPath);
      }
    });
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error(`[Main] [${new Date().toISOString()}] did-fail-load: code=${errorCode}, description="${errorDescription}", url=${validatedURL}, isMainFrame=${isMainFrame}`);
    if (isMainFrame) {
      const fallback = resolveLocalIndexHtml();
      if (fallback) {
        console.log(`[Main] [${new Date().toISOString()}] did-fail-load recovering by loading local bundle: ${fallback}`);
        mainWindow.loadFile(fallback);
      }
    }
  });

  // Windows-specific: Listen for native hardware arrival/removal events (WM_DEVICECHANGE: 0x0219).
  // Uses RegisterDeviceNotification for GUID_DEVINTERFACE_VOLUME and bounded retries to handle volume mounting.
  if (process.platform === 'win32') {
    let pendingRetryTimers = [];
    let DEV_BROADCAST_VOLUME_TYPE = null;
    let unregisterDeviceNotificationFn = null;
    let activeDeviceNotifications = [];

    // Register top-level window with Windows PnP subsystem to receive broadcast device interface notifications
    function setupWin32DeviceNotifications(hwndBuf) {
      try {
        const koffi = require('koffi');
        const user32 = koffi.load('user32.dll');

        const GUID = koffi.struct('GUID', {
          Data1: 'uint32',
          Data2: 'uint16',
          Data3: 'uint16',
          Data4: koffi.array('uint8', 8),
        });

        koffi.struct('DEV_BROADCAST_DEVICEINTERFACE_W', {
          dbcc_size: 'uint32',
          dbcc_devicetype: 'uint32',
          dbcc_reserved: 'uint32',
          dbcc_classguid: GUID,
          dbcc_name: koffi.array('char16', 1),
        });

        DEV_BROADCAST_VOLUME_TYPE = koffi.struct('DEV_BROADCAST_VOLUME', {
          dbcv_size: 'uint32',
          dbcv_devicetype: 'uint32',
          dbcv_reserved: 'uint32',
          dbcv_unitmask: 'uint32',
          dbcv_flags: 'uint16',
        });

        const RegisterDeviceNotificationW = user32.func(
          'RegisterDeviceNotificationW',
          'intptr_t',
          ['intptr_t', 'void *', 'uint32']
        );

        unregisterDeviceNotificationFn = user32.func(
          'UnregisterDeviceNotification',
          'bool',
          ['intptr_t']
        );

        const hwnd = hwndBuf.length >= 8
          ? hwndBuf.readBigUInt64LE(0)
          : BigInt(hwndBuf.readUInt32LE(0));

        const DEVICE_NOTIFY_WINDOW_HANDLE = 0x00000000;
        const DEVICE_NOTIFY_ALL_INTERFACE_CLASSES = 0x00000004;

        function buildFilterBuffer(guidD1, guidD2, guidD3, guidD4) {
          const buf = Buffer.alloc(32);
          buf.writeUInt32LE(32, 0); // dbcc_size = 32 bytes
          buf.writeUInt32LE(0x00000005, 4); // DBT_DEVTYP_DEVICEINTERFACE = 5
          buf.writeUInt32LE(0, 8); // dbcc_reserved = 0
          buf.writeUInt32LE(guidD1, 12);
          buf.writeUInt16LE(guidD2, 16);
          buf.writeUInt16LE(guidD3, 18);
          Buffer.from(guidD4).copy(buf, 20);
          return buf;
        }

        // 1. GUID_DEVINTERFACE_VOLUME: {53f5630d-b6bf-11d0-94f2-00a0c91efb8b}
        const volFilter = buildFilterBuffer(
          0x53f5630d, 0xb6bf, 0x11d0,
          [0x94, 0xf2, 0x00, 0xa0, 0xc9, 0x1e, 0xfb, 0x8b]
        );
        const hVol = RegisterDeviceNotificationW(hwnd, volFilter, DEVICE_NOTIFY_WINDOW_HANDLE);
        if (hVol) activeDeviceNotifications.push(hVol);

        // 2. GUID_DEVINTERFACE_DISK: {53f56307-b6bf-11d0-94f2-00a0c91efb8b}
        const diskFilter = buildFilterBuffer(
          0x53f56307, 0xb6bf, 0x11d0,
          [0x94, 0xf2, 0x00, 0xa0, 0xc9, 0x1e, 0xfb, 0x8b]
        );
        const hDisk = RegisterDeviceNotificationW(hwnd, diskFilter, DEVICE_NOTIFY_WINDOW_HANDLE);
        if (hDisk) activeDeviceNotifications.push(hDisk);

        // 3. Register for ALL device interface classes with window handle
        const allFilter = buildFilterBuffer(
          0x53f5630d, 0xb6bf, 0x11d0,
          [0x94, 0xf2, 0x00, 0xa0, 0xc9, 0x1e, 0xfb, 0x8b]
        );
        const hAll = RegisterDeviceNotificationW(hwnd, allFilter, DEVICE_NOTIFY_WINDOW_HANDLE | DEVICE_NOTIFY_ALL_INTERFACE_CLASSES);
        if (hAll) activeDeviceNotifications.push(hAll);

        const hexHwnd = '0x' + hwnd.toString(16).toUpperCase();
        const hexVol = hVol ? '0x' + hVol.toString(16).toUpperCase() : 'null';
        const hexDisk = hDisk ? '0x' + hDisk.toString(16).toUpperCase() : 'null';
        const hexAll = hAll ? '0x' + hAll.toString(16).toUpperCase() : 'null';

        console.log(
          `[NativeEvent] [${new Date().toISOString()}] RegisterDeviceNotification result: handle=${hexVol} (GUID_DEVINTERFACE_VOLUME) handle_disk=${hexDisk} handle_all=${hexAll} on HWND=${hexHwnd}`
        );
      } catch (err) {
        console.error(
          `[NativeEvent] [${new Date().toISOString()}] RegisterDeviceNotification error: ${err.message}`
        );
      }
    }

    // Call RegisterDeviceNotification on the top-level window
    setupWin32DeviceNotifications(mainWindow.getNativeWindowHandle());

    function decodeBroadcastLParam(lParam) {
      if (!lParam) return null;
      try {
        const lPtr = Buffer.isBuffer(lParam)
          ? (lParam.length >= 8 ? lParam.readBigUInt64LE(0) : BigInt(lParam.readUInt32LE(0)))
          : (typeof lParam === 'bigint' ? lParam : BigInt(lParam));

        if (!lPtr || lPtr === 0n || !DEV_BROADCAST_VOLUME_TYPE) return null;

        const koffi = require('koffi');
        const vol = koffi.decode(lPtr, DEV_BROADCAST_VOLUME_TYPE);
        if (vol && vol.dbcv_devicetype === 2) { // DBT_DEVTYP_VOLUME
          const mask = vol.dbcv_unitmask || 0;
          const letters = [];
          for (let i = 0; i < 26; i++) {
            if ((mask & (1 << i)) !== 0) {
              letters.push(String.fromCharCode(65 + i) + ':');
            }
          }
          return {
            deviceType: 'VOLUME',
            unitmask: mask,
            driveLetter: letters.join(', ') || null,
            flags: vol.dbcv_flags,
          };
        } else if (vol && vol.dbcv_devicetype === 5) {
          return { deviceType: 'DEVICEINTERFACE' };
        }
      } catch {
        // Safe fallback if memory address is not readable
      }
      return null;
    }

    let detectionWatchdogTimer = null;

    const scheduleExponentialBackoffRescan = (triggerReason, hintDriveLetter = null) => {
      // Clear any pending timers to avoid overlapping floods
      pendingRetryTimers.forEach(clearTimeout);
      pendingRetryTimers = [];

      if (detectionWatchdogTimer) {
        clearTimeout(detectionWatchdogTimer);
        detectionWatchdogTimer = null;
      }

      // Hard 20-second watchdog: guaranteed terminal state fallback
      if (triggerReason.includes('ARRIVAL')) {
        detectionWatchdogTimer = setTimeout(() => {
          if (currentTrayTooltip.includes('Detecting USB drive')) {
            console.warn(`[Main] [${new Date().toISOString()}] Detection watchdog fired (20s). Forcing terminal FAILED state.`);
            setTrayStatus(hintDriveLetter
              ? `Dero Vault — Detection failed for USB (${hintDriveLetter}) – click to retry`
              : `Dero Vault — Detection failed – click to retry`);
          }
        }, 20000);
      }

      // Bounded exponential backoff schedule: 250ms, 500ms, 1s, 2s, 4s, 8s (~15s total coverage)
      const delays = [250, 500, 1000, 2000, 4000, 8000];
      delays.forEach((delay, idx) => {
        const timer = setTimeout(async () => {
          console.log(`[Main] [${new Date().toISOString()}] Bounded retry scan executing at T+${delay}ms (attempt ${idx + 1}/${delays.length}) [Trigger: ${triggerReason}]`);
          const res = await requestDriveRescan(SERVER_PORT, `wm-devicechange-retry-${delay}ms`, hintDriveLetter);
          if (res && res.count > 0 && triggerReason.includes('ARRIVAL')) {
            console.log(`[Main] [${new Date().toISOString()}] Storage volume successfully observed on retry attempt ${idx + 1} (${res.count} drive(s)). Cancelling remaining retries.`);
            pendingRetryTimers.forEach(clearTimeout);
            pendingRetryTimers = [];
            if (detectionWatchdogTimer) {
              clearTimeout(detectionWatchdogTimer);
              detectionWatchdogTimer = null;
            }
            if (Array.isArray(res.drives) && res.drives.length > 0) {
              for (const d of res.drives) {
                if (!d.partial) {
                  addOrUpdateConnectedDrive(d);
                }
              }
              const matched = res.drives.find(d => hintDriveLetter ? d.driveLetter.startsWith(hintDriveLetter.replace(':', '')) : true) || res.drives[0];
              if (matched.isRegistered) {
                syncTrayState(`retry arrival registered (${matched.driveLetter})`);
              } else {
                appState.pendingRegistrationDrive = matched;
                pendingRegistrationDrive = matched;
                lastUnregisteredDrive = matched;
                syncTrayState(`retry arrival unregistered (${matched.driveLetter})`);
              }
            }
          } else if (idx === delays.length - 1 && (!res || res.count === 0)) {
            console.log(`[Main] [${new Date().toISOString()}] Bounded retry sequence complete (~15s).`);
            if (detectionWatchdogTimer) {
              clearTimeout(detectionWatchdogTimer);
              detectionWatchdogTimer = null;
            }
            if (appState.connectedDrives.size === 0 && currentTrayTooltip.includes('Detecting USB drive')) {
              setTrayStatus(hintDriveLetter
                ? `Dero Vault — Detection failed for USB (${hintDriveLetter}) – click to retry`
                : `Dero Vault — Detection failed – click to retry`, 'retry-exhausted-failed');
            }
          }
        }, delay);
        pendingRetryTimers.push(timer);
      });
    };


    function parseWindowParam(param) {
      if (typeof param === 'number') {
        return param;
      }
      if (param && Buffer.isBuffer(param)) {
        if (param.length >= 4) {
          return param.readUInt32LE(0);
        }
        if (param.length >= 2) {
          return param.readUInt16LE(0);
        }
        if (param.length === 1) {
          return param.readUInt8(0);
        }
      }
      return 0;
    }

    mainWindow.hookWindowMessage(0x0219, (wParam, lParam) => {
      const wParamNum = parseWindowParam(wParam);
      const hexWParam = '0x' + wParamNum.toString(16).toUpperCase().padStart(4, '0');
      const hexLParam = Buffer.isBuffer(lParam)
        ? ('0x' + (lParam.length >= 8 ? lParam.readBigUInt64LE(0) : BigInt(lParam.readUInt32LE(0))).toString(16).toUpperCase())
        : (typeof lParam === 'bigint' ? '0x' + lParam.toString(16).toUpperCase() : (lParam || 0));

      const eventTypeName = wParamNum === 0x8000
        ? 'DBT_DEVICEARRIVAL (0x8000)'
        : wParamNum === 0x8004
        ? 'DBT_DEVICEREMOVECOMPLETE (0x8004)'
        : wParamNum === 0x0007
        ? 'DBT_DEVNODES_CHANGED (0x0007)'
        : `OTHER (${hexWParam})`;

      const volumeInfo = decodeBroadcastLParam(lParam);
      const decodedType = volumeInfo ? volumeInfo.deviceType : 'NULL/RAW';
      const extractedLetter = volumeInfo && volumeInfo.driveLetter ? volumeInfo.driveLetter : null;
      const volInfoStr = extractedLetter
        ? ` Volume: ${extractedLetter} (mask: 0x${volumeInfo.unitmask.toString(16).toUpperCase()})`
        : '';

      console.log(`[NativeEvent] [${new Date().toISOString()}] WM_DEVICECHANGE event=${eventTypeName}, raw wParam=${hexWParam}, raw lParam=${hexLParam}, decodedType=${decodedType}, driveLetter=${extractedLetter || 'none'}${volInfoStr}`);

      // DBT_DEVICEARRIVAL (0x8000), DBT_DEVICEREMOVECOMPLETE (0x8004), DBT_DEVNODES_CHANGED (0x0007)
      if (wParamNum === 0x8000) {
        if (extractedLetter) {
          console.log(`[Main] fast-path started for ${extractedLetter}`);
          console.log(`[Main] [${new Date().toISOString()}] Proceeding with targeted fast-path handler for ${extractedLetter}`);
        } else {
          console.log(`[Main] [${new Date().toISOString()}] Device arrival received without drive letter (deviceType=${decodedType}). Proceeding with unhinted rescan.`);
        }

        console.log(`[Main] [${new Date().toISOString()}] tray set to Detecting USB drive (${extractedLetter || 'device'})...`);
        setTrayStatus(extractedLetter
          ? `Dero Vault — Detecting USB drive (${extractedLetter})...`
          : 'Dero Vault — Detecting USB drive...');

        if (extractedLetter) {
          // Ultra-fast path: immediately trigger targeted drive rescan (T+0ms)
          (async () => {
            const fastStart = Date.now();
            console.log(`[Main] [${new Date().toISOString()}] Triggering immediate fast-path rescan for ${extractedLetter}`);
            const res = await requestDriveRescan(SERVER_PORT, 'wm-devicechange-fast', extractedLetter);
            const elapsed = Date.now() - fastStart;
            console.log(`[Main] [${new Date().toISOString()}] Fast-path HTTP response received: status=${res ? 200 : 'error'}, count=${res ? res.count : 0} in ${elapsed}ms`);
            if (res && res.count > 0 && Array.isArray(res.drives) && res.drives.length > 0) {
              const clean = extractedLetter.replace(/[^a-zA-Z]/g, '').toUpperCase();
              const matched = res.drives.find(d => d.driveLetter && d.driveLetter.toUpperCase().startsWith(clean)) || res.drives[0];
              if (matched && !matched.partial) {
                console.log(`[Main] [${new Date().toISOString()}] Fast-path completed in ${elapsed}ms for ${extractedLetter}. Storing in authoritative appState.`);
                const wasConnected = appState.connectedDrives.has(matched.stableHardwareId);
                addOrUpdateConnectedDrive(matched);
                if (matched.isRegistered) {
                  syncTrayState(`fast-path arrival registered (${matched.driveLetter})`);
                  showTrayNotification({
                    title: 'Dero Vault',
                    content: `Registered drive "${matched.friendlyName || matched.volumeLabel}" connected. Automatic backup starting.`,
                  });
                } else {
                  appState.pendingRegistrationDrive = matched;
                  pendingRegistrationDrive = matched;
                  lastUnregisteredDrive = matched;
                  syncTrayState(`fast-path arrival unregistered (${matched.driveLetter})`);
                  console.log(`[Main] [${new Date().toISOString()}] Triggering arrival notification for ${matched.driveLetter} (${matched.volumeLabel})`);
                  showTrayNotification({
                    title: 'Dero Vault',
                    content: `New removable storage: ${matched.volumeLabel || 'Disk'} (${matched.driveLetter}). Click to configure.`,
                    drive: matched,
                    onClick: () => openRegistrationForDrive(matched),
                  });
                }
                return; // Reached terminal state in well under 300-500ms! No retry needed!
              }
            }
            console.log(`[Main] [${new Date().toISOString()}] Fast-path did not immediately resolve in ${elapsed}ms. Scheduling bounded retries.`);
            scheduleExponentialBackoffRescan(`DBT_DEVICEARRIVAL (0x8000)${volInfoStr}`, extractedLetter);
          })();
        } else {
          scheduleExponentialBackoffRescan(`DBT_DEVICEARRIVAL (0x8000)${volInfoStr}`, null);
        }
      } else if (wParamNum === 0x8004) {
        console.log(`[NativeEvent] [${new Date().toISOString()}] Device removal complete event (0x8004) for ${extractedLetter || 'device'}`);
        removeDeviceFromState(extractedLetter, 'wm_devicechange:0x8004');

        // Immediately notify backend server so DriveDetector marks drive DISCONNECTED
        const postData = JSON.stringify({ driveLetter: extractedLetter });
        const req = http.request({
          hostname: '127.0.0.1',
          port: SERVER_PORT,
          path: '/api/drives/removal',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 2000,
        }, () => {});
        req.on('error', (err) => {
          console.warn(`[Main] /api/drives/removal notification error: ${err.message}`);
        });
        req.write(postData);
        req.end();
      } else if (wParamNum === 0x0007) {
        console.log(`[Main] [${new Date().toISOString()}] Devnodes changed (0x0007). Reconciling drive presence.`);
        // Purge any drives whose mount paths no longer physically exist
        const fs = require('fs');
        for (const [id, d] of Array.from(appState.connectedDrives.entries())) {
          if (d.mountPath && !fs.existsSync(d.mountPath)) {
            console.log(`[Main] Devnodes changed: drive ${d.driveLetter} (${id}) is physically absent. Removing.`);
            removeDeviceFromState(d.driveLetter, 'wm_devnodes_changed:absent');
          }
        }
        requestDriveRescan(SERVER_PORT, 'wm-devnodes-changed').then((res) => {
          if (res && Array.isArray(res.drives) && res.drives.length > 0) {
            for (const d of res.drives) {
              if (!d.partial) {
                addOrUpdateConnectedDrive(d);
              }
            }
            syncTrayState('wm-devnodes-reconciled');
          }
        }).catch(() => {});
      }
      return true;
    });


    // Cleanup notifications when window or app closes
    app.on('before-quit', () => {
      if (unregisterDeviceNotificationFn && activeDeviceNotifications.length > 0) {
        for (const hNotify of activeDeviceNotifications) {
          try { unregisterDeviceNotificationFn(hNotify); } catch {}
        }
        activeDeviceNotifications = [];
      }
    });
  }

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });
}

function createTray() {
  const icoPath = path.join(__dirname, 'assets', 'icon.ico');
  const pngPath = path.join(__dirname, 'assets', 'tray_icon.png');
  const fs = require('fs');
  const trayIconPath = fs.existsSync(icoPath) ? icoPath : pngPath;

  const icon = nativeImage.createFromPath(trayIconPath);
  if (icon.isEmpty()) {
    console.log(`[Tray] [${new Date().toISOString()}] Warning: Tray icon at ${trayIconPath} was empty. Creating empty fallback icon.`);
  }

  try {
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    console.log(`[Tray] [${new Date().toISOString()}] Tray created successfully in Electron main process with icon: ${trayIconPath}`);
  } catch (err) {
    console.log(`[Tray] [${new Date().toISOString()}] Tray creation failed: ${err.message}`);
    return;
  }

  setTrayStatus('Dero Vault — Idle (Waiting for USB drive)');

  let isAutoBackupPaused = false;

  function updateContextMenu() {
    if (!tray) return;

    const pendingTarget = lastUnregisteredDrive || appState.pendingRegistrationDrive;

    const items = [
      {
        label: 'Open Dero Vault',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('app:expand');
          }
        },
      },
    ];

    if (pendingTarget) {
      items.push({
        label: `Configure USB Drive (${pendingTarget.driveLetter})...`,
        click: () => {
          console.log(`[TrayMenu] User clicked "Configure USB Drive (${pendingTarget.driveLetter})"`);
          openRegistrationForDrive(pendingTarget);
        },
      });
    }

    items.push(
      {
        label: isAutoBackupPaused ? 'Resume Automatic Backup' : 'Pause Automatic Backup',
        click: (item) => {
          isAutoBackupPaused = !isAutoBackupPaused;
          item.label = isAutoBackupPaused ? 'Resume Automatic Backup' : 'Pause Automatic Backup';
          console.log(`[Tray] Auto backup toggled to: ${isAutoBackupPaused ? 'PAUSED' : 'ACTIVE'}`);
        },
      },
      {
        label: 'Settings',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('app:navigate', 'settings');
          }
        },
      },
      {
        label: 'Start at Windows Login',
        type: 'checkbox',
        checked: Boolean(getWindowsStartupStatus().enabled),
        click: (menuItem) => {
          const newStatus = menuItem.checked;
          console.log(`[Tray] Start at Windows Login toggled from tray: ${newStatus}`);
          syncWindowsStartupRegistration(newStatus);
          try {
            const postData = JSON.stringify({ enabled: newStatus });
            const req = http.request({
              hostname: '127.0.0.1',
              port: SERVER_PORT,
              path: '/api/system/startup',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
              },
              timeout: 2000,
            }, () => {});
            req.on('error', () => {});
            req.write(postData);
            req.end();
          } catch {}
          updateContextMenu();
        },
      },
      {
        label: 'Rescan Storage Drives',
        click: async () => {
          console.log(`[Tray] Manual rescan triggered from tray context menu.`);
          setTrayStatus('Dero Vault — Scanning storage drives...');
          const res = await requestDriveRescan(SERVER_PORT, 'tray-menu-rescan');
          if (res && res.count > 0 && Array.isArray(res.drives)) {
            for (const d of res.drives) {
              if (!d.partial) addOrUpdateConnectedDrive(d);
            }
          }
          syncTrayState('tray-menu-rescan-complete');
        },
      },
      {
        label: 'Developer Tools',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.webContents.openDevTools();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Exit Dero Vault',
        click: () => {
          if (appState.activeBackupSession && ['scanning', 'comparing', 'copying', 'verifying'].includes(appState.activeBackupSession.status)) {
            const choice = dialog.showMessageBoxSync(mainWindow || null, {
              type: 'warning',
              buttons: ['Cancel', 'Quit Anyway'],
              defaultId: 0,
              cancelId: 0,
              title: 'Dero Vault — Active Backup in Progress',
              message: 'A backup is currently in progress. Exiting now may interrupt file copying.',
              detail: 'Do you want to cancel the backup and quit immediately?',
            });
            if (choice !== 1) {
              return;
            }
          }
          app.isQuitting = true;
          app.quit();
        },
      }
    );

    tray.setContextMenu(Menu.buildFromTemplate(items));
  }

  updateTrayContextMenu = updateContextMenu;
  updateContextMenu();

  tray.on('click', async () => {
    // If tray is in an error or prompt state, a single click triggers an immediate rescan
    if (currentTrayTooltip.includes('click to') || currentTrayTooltip.includes('Detection failed')) {
      console.log(`[Tray] Tray clicked while in error/retry state. Triggering immediate rescan.`);
      setTrayStatus('Dero Vault — Scanning storage drives...');
      const res = await requestDriveRescan(SERVER_PORT, 'tray-click-rescan');
      if (res && res.count > 0 && Array.isArray(res.drives)) {
        for (const d of res.drives) {
          if (!d.partial) addOrUpdateConnectedDrive(d);
        }
      }
      syncTrayState('tray-click-rescan-complete');
      return;
    }

    // Required fallback: clicking the tray icon must open the application and (if unregistered drive present) open configuration for it
    const targetDrive = lastUnregisteredDrive || appState.pendingRegistrationDrive;
    console.log(`[TrayAction] [${new Date().toISOString()}] Tray single-click. targetDrive=${targetDrive ? targetDrive.driveLetter : 'none'}`);
    if (targetDrive) {
      openRegistrationForDrive(targetDrive);
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('app:expand');
    }
  });

  tray.on('double-click', () => {
    const targetDrive = lastUnregisteredDrive || appState.pendingRegistrationDrive;
    console.log(`[TrayAction] [${new Date().toISOString()}] Tray double-clicked. targetDrive=${targetDrive ? targetDrive.driveLetter : 'none'}`);
    if (targetDrive) {
      openRegistrationForDrive(targetDrive);
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('app:expand');
    }
  });

  tray.on('balloon-click', () => {
    const targetDrive = lastUnregisteredDrive || appState.pendingRegistrationDrive;
    console.log(`[TrayAction] [${new Date().toISOString()}] Tray balloon clicked. Opening configuration for drive: ${targetDrive ? targetDrive.driveLetter : 'none'}`);
    if (targetDrive) {
      openRegistrationForDrive(targetDrive);
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('app:expand');
    }
  });
}


// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    await ensureServerRunning();

    // Query persisted startup setting from local backend and synchronize with Windows
    try {
      const startupPref = await new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${SERVER_PORT}/api/system/startup`, (res) => {
          let raw = '';
          res.on('data', (chunk) => { raw += chunk; });
          res.on('end', () => {
            try { resolve(JSON.parse(raw)); } catch { resolve(null); }
          });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(1500, () => { req.destroy(); resolve(null); });
      });

      if (startupPref && typeof startupPref.enabled === 'boolean') {
        console.log(`[Startup] Read startup preference from backend: enabled=${startupPref.enabled}`);
        syncWindowsStartupRegistration(startupPref.enabled);
      } else {
        console.log(`[Startup] Defaulting to enabled=true as per product philosophy`);
        syncWindowsStartupRegistration(true);
      }
    } catch (e) {
      console.warn(`[Startup] Startup sync fallback error: ${e.message}`);
      syncWindowsStartupRegistration(true);
    }

    createWindow();
    createTray();
    subscribeToBackendEvents();

    // Reconcile pre-existing connected drives on application startup
    console.log(`[Main] [${new Date().toISOString()}] Reconciling pre-existing connected drives on startup...`);
    requestDriveRescan(SERVER_PORT, 'startup-initial-scan').then((res) => {
      console.log(`[Main] [${new Date().toISOString()}] Startup drive scan completed: ${res ? res.count : 0} drive(s) found.`);
      if (res && res.count > 0 && Array.isArray(res.drives) && res.drives.length > 0) {
        for (const drive of res.drives) {
          if (!drive.partial) {
            addOrUpdateConnectedDrive(drive);
          }
        }
        const drive = res.drives[0];
        if (drive.isRegistered) {
          console.log(`[Tray] [${new Date().toISOString()}] Startup drive matched registered (${drive.driveLetter}). Setting REGISTERED state.`);
          syncTrayState(`startup-scan (registered: ${drive.driveLetter})`);
        } else {
          console.log(`[Tray] [${new Date().toISOString()}] Startup drive matched unregistered (${drive.driveLetter}). Setting UNREGISTERED state.`);
          appState.pendingRegistrationDrive = drive;
          pendingRegistrationDrive = drive;
          lastUnregisteredDrive = drive;
          syncTrayState(`startup-scan (unregistered: ${drive.driveLetter})`);
        }
      } else {
        syncTrayState('startup-scan (empty)');
      }
    }).catch((err) => {
      console.log(`[Main] [${new Date().toISOString()}] Startup drive scan error: ${err.message}`);
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('before-quit', () => {
  app.isQuitting = true;
  if (tray) {
    try {
      tray.destroy();
      tray = null;
    } catch {}
  }
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch {}
  }
});

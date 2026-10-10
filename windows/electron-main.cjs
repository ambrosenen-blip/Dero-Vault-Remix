/**
 * Dero Vault — Electron Main Process for Windows 10 / 11
 * Self-contained desktop runner: boots local backend server, handles system tray,
 * and exposes native Windows folder picker dialogs.
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');
const { fork } = require('child_process');

let mainWindow = null;
let tray = null;
let serverProcess = null;
const SERVER_PORT = 3000;

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

ipcMain.handle('window:minimizeToTray', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.handle('window:expand', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('app:expand');
  }
});

ipcMain.handle('tray:notify', (_event, opts) => {
  const { title = 'Dero Vault', content = '', type = 'info' } = opts || {};
  if (tray) {
    try {
      tray.displayBalloon({
        iconType: type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info',
        title,
        content,
      });
    } catch {}
  }
});

ipcMain.handle('app:quit', () => {
  app.isQuitting = true;
  app.quit();
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
    console.log(`[Main] [${new Date().toISOString()}] Calling POST /api/drives/rescan (source: ${source}, driveLetter: ${driveLetter || 'none'})`);
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
          console.log(`[Main] [${new Date().toISOString()}] Received rescan response: status=${res.statusCode}, count=${parsed.count ?? 0}`);
          resolve(parsed);
        } catch {
          console.log(`[Main] [${new Date().toISOString()}] Received non-JSON rescan response (status=${res.statusCode})`);
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

// Subscribe Electron Main Process directly to Backend SSE Stream
// Ensures the System Tray reacts reliably to drive & backup events even when renderer is closed or minimized
let lastBalloonContent = '';
let lastBalloonTime = 0;

function showTrayNotification(opts) {
  if (!tray) return;
  const { title = 'Dero Vault', content = '', type = 'info' } = opts || {};
  const now = Date.now();
  if (content === lastBalloonContent && (now - lastBalloonTime) < 1500) {
    return; // Prevent duplicate balloon spam
  }
  lastBalloonContent = content;
  lastBalloonTime = now;
  try {
    tray.displayBalloon({
      iconType: type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info',
      title,
      content,
    });
  } catch (err) {
    console.log(`[Tray] [${new Date().toISOString()}] displayBalloon failed: ${err.message}`);
  }
}

function subscribeToBackendEvents() {
  console.log(`[Tray] [${new Date().toISOString()}] Connecting main process to backend event stream (SSE)...`);
  const req = http.get(`http://127.0.0.1:${SERVER_PORT}/api/events`, (res) => {
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

  req.on('error', (err) => {
    console.log(`[Tray] [${new Date().toISOString()}] SSE connection error: ${err.message}. Retrying in 2s...`);
    setTimeout(subscribeToBackendEvents, 2000);
  });
}

function handleBackendStateChange(eventType, data) {
  console.log(`[Tray] [${new Date().toISOString()}] State change event received from backend: ${eventType}`);

  if (eventType === 'drive:connected' && data) {
    const drive = data;
    if (drive.partial || drive.reason === 'detection-timeout') {
      console.log(`[TrayAction] [${new Date().toISOString()}] Action decided: Partial classification for drive ${drive.driveLetter}. Setting error/rescan tooltip.`);
      if (tray) {
        tray.setToolTip(`Dero Vault — Detecting USB drive (${drive.driveLetter}) — could not classify. Click to rescan.`);
        console.log(`[Tray] [${new Date().toISOString()}] Tray state updated: Detecting USB drive (${drive.driveLetter}) — could not classify. Click to rescan.`);
      }
      showTrayNotification({
        title: 'Dero Vault',
        content: `USB drive detected (${drive.driveLetter}), but full classification timed out. Click to rescan.`,
      });
      return;
    }

    if (drive.isRegistered) {
      console.log(`[TrayAction] [${new Date().toISOString()}] Action decided: Registered drive connected. Triggering auto-backup status notification.`);
      if (tray) {
        tray.setToolTip(`Dero Vault — Backing up ${drive.friendlyName || drive.volumeLabel} (${drive.driveLetter})...`);
        console.log(`[Tray] [${new Date().toISOString()}] Tooltip updated to: Dero Vault — Backing up ${drive.friendlyName || drive.volumeLabel} (${drive.driveLetter})...`);
      }
      console.log(`[TrayAction] [${new Date().toISOString()}] Action executed: tray notification for registered drive connection.`);
      showTrayNotification({
        title: 'Dero Vault',
        content: `Registered drive "${drive.friendlyName || drive.volumeLabel}" connected. Automatic backup starting.`,
      });
    } else {
      console.log(`[TrayAction] [${new Date().toISOString()}] Action decided: Unregistered drive detected (${drive.driveLetter}). Showing registration prompt.`);
      if (tray) {
        tray.setToolTip(`Dero Vault — New USB drive detected (${drive.driveLetter})`);
        console.log(`[Tray] [${new Date().toISOString()}] Tooltip updated to: Dero Vault — New USB drive detected (${drive.driveLetter})`);
      }
      console.log(`[TrayAction] [${new Date().toISOString()}] Action executed: tray notification for unregistered drive.`);
      showTrayNotification({
        title: 'Dero Vault',
        content: `New USB storage detected: ${drive.volumeLabel || 'Disk'} (${drive.driveLetter}). Click to protect.`,
      });
    }
  } else if (eventType === 'drive:unregistered_detected' && data) {
    const drive = data;
    if (drive.partial || drive.reason === 'detection-timeout') {
      return; // Already handled above in drive:connected
    }
    console.log(`[TrayAction] [${new Date().toISOString()}] Action decided: Unregistered storage prompt confirmed.`);
    if (tray) {
      tray.setToolTip(`Dero Vault — Unregistered drive detected (${drive.driveLetter})`);
      console.log(`[Tray] [${new Date().toISOString()}] Tray state updated: tooltip="Dero Vault — Unregistered drive detected (${drive.driveLetter})"`);
    }
    showTrayNotification({
      title: 'Dero Vault',
      content: `New removable storage: ${drive.volumeLabel || 'Disk'} (${drive.driveLetter}). Click to configure.`,
    });
  } else if (eventType === 'drive:disconnected' && data) {
    const drive = data;
    console.log(`[TrayAction] [${new Date().toISOString()}] Action decided: Storage device disconnected (${drive.driveLetter}). Setting tooltip to Idle.`);
    if (tray) {
      tray.setToolTip('Dero Vault — Idle (Waiting for USB drive)');
      console.log(`[Tray] [${new Date().toISOString()}] Tray state updated: Idle (Waiting for USB drive)`);
    }
  } else if (eventType === 'backup:start' && data) {
    console.log(`[TrayAction] [${new Date().toISOString()}] Action decided: Backup session started.`);
    if (tray) {
      tray.setToolTip(`Dero Vault — Backing up ${data.driveName || 'removable drive'}...`);
      console.log(`[Tray] [${new Date().toISOString()}] Tray state updated: Backing up ${data.driveName || 'removable drive'}...`);
    }
  } else if (eventType === 'backup:update' && data) {
    if (tray) tray.setToolTip(`Dero Vault — Backing up ${data.driveName}: ${data.filesProcessed}/${data.totalFiles} (${data.progress || 0}%)...`);
  } else if (eventType === 'backup:complete' && data) {
    console.log(`[TrayAction] [${new Date().toISOString()}] Action decided: Backup session successfully completed.`);
    if (tray) {
      tray.setToolTip("Dero Vault — Today's work is safely backed up.");
      console.log(`[Tray] [${new Date().toISOString()}] Tray state updated: Today's work is safely backed up.`);
    }
    console.log(`[TrayAction] [${new Date().toISOString()}] Action executed: backup completion notification toast.`);
    showTrayNotification({
      title: 'Dero Vault',
      content: "✓ Today's work is safely backed up.",
    });
  }
}

// Start embedded backend server
async function ensureServerRunning() {
  const isRunning = await pingServer(SERVER_PORT);
  if (isRunning) {
    console.log('[Electron] Server already running on port', SERVER_PORT);
    return;
  }

  const serverScript = path.join(__dirname, '..', 'dist-server', 'server.mjs');
  console.log('[Electron] Starting embedded Dero Vault server:', serverScript);

  serverProcess = fork(serverScript, [], {
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      NODE_ENV: 'production',
    },
    stdio: 'ignore',
  });

  // Wait for server to become responsive
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await pingServer(SERVER_PORT)) {
      console.log('[Electron] Embedded server is ready.');
      return;
    }
  }

  console.warn('[Electron] Server took longer than expected to report ready.');
}

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'Dero Vault — Your Digital Granary',
    icon: icon.isEmpty() ? undefined : icon,
    frame: true,
    backgroundColor: '#020617', // Slate-950
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${SERVER_PORT}`);

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
      if (hintDriveLetter && triggerReason.includes('ARRIVAL')) {
        detectionWatchdogTimer = setTimeout(() => {
          if (tray) {
            const currentTip = tray.getToolTip ? tray.getToolTip() : '';
            if (currentTip.includes('Detecting USB drive')) {
              console.warn(`[Main] [${new Date().toISOString()}] Detection watchdog fired (20s). Forcing terminal error state.`);
              tray.setToolTip(`Dero Vault — Detection timed out for USB (${hintDriveLetter}) — click to retry.`);
              console.log(`[Tray] [${new Date().toISOString()}] Tooltip updated to: Dero Vault — Detection timed out for USB (${hintDriveLetter}) — click to retry.`);
            }
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
          } else if (idx === delays.length - 1 && (!res || res.count === 0)) {
            console.log(`[Main] [${new Date().toISOString()}] Bounded retry sequence complete (~15s). Drive was never observed post-arrival.`);
            if (detectionWatchdogTimer) {
              clearTimeout(detectionWatchdogTimer);
              detectionWatchdogTimer = null;
            }
            if (hintDriveLetter && tray) {
              console.log(`[Tray] [${new Date().toISOString()}] Action decided: Classification timed out for drive ${hintDriveLetter}. Setting error/rescan state.`);
              tray.setToolTip(`Dero Vault — Detection failed for USB (${hintDriveLetter}) — click to retry.`);
              console.log(`[Tray] [${new Date().toISOString()}] Tooltip updated to: Dero Vault — Detection failed for USB (${hintDriveLetter}) — click to retry.`);
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

      const volumeInfo = decodeBroadcastLParam(lParam);
      const volInfoStr = volumeInfo && volumeInfo.driveLetter
        ? ` Volume: ${volumeInfo.driveLetter} (mask: 0x${volumeInfo.unitmask.toString(16).toUpperCase()})`
        : '';

      const driveLetterLogged = volumeInfo && volumeInfo.driveLetter ? volumeInfo.driveLetter : 'none';
      console.log(`[Main] [${new Date().toISOString()}] WM_DEVICECHANGE received (wParam=${hexWParam}, lParam=${hexLParam}, drive letter=${driveLetterLogged})${volInfoStr}`);

      // DBT_DEVICEARRIVAL (0x8000), DBT_DEVICEREMOVECOMPLETE (0x8004), DBT_DEVNODES_CHANGED (0x0007)
      if (wParamNum === 0x8000) {
        const letter = volumeInfo && volumeInfo.driveLetter ? volumeInfo.driveLetter : null;
        if (letter && tray) {
          tray.setToolTip(`Dero Vault — Detecting USB drive (${letter})...`);
          console.log(`[Main] [${new Date().toISOString()}] Tray set to "Detecting USB drive (${letter})..."`);
          console.log(`[Tray] [${new Date().toISOString()}] Tooltip updated to: Dero Vault — Detecting USB drive (${letter})...`);
        }
        scheduleExponentialBackoffRescan(`DBT_DEVICEARRIVAL (0x8000)${volInfoStr}`, letter);
      } else if (wParamNum === 0x8004) {
        if (tray) {
          tray.setToolTip('Dero Vault — Idle (Waiting for USB drive)');
          console.log(`[Tray] [${new Date().toISOString()}] Tooltip updated to: Dero Vault — Idle (Waiting for USB drive)`);
        }
        scheduleExponentialBackoffRescan(`DBT_DEVICEREMOVECOMPLETE (0x8004)${volInfoStr}`, null);
      } else if (wParamNum === 0x0007) {
        scheduleExponentialBackoffRescan('DBT_DEVNODES_CHANGED (0x0007)', null);
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

  tray.setToolTip('Dero Vault — Idle (Waiting for USB drive)');

  let isAutoBackupPaused = false;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Dero Vault',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('app:expand');
        }
      },
    },
    {
      label: isAutoBackupPaused ? 'Resume Automatic Backup' : 'Pause Automatic Backup',
      click: (item) => {
        isAutoBackupPaused = !isAutoBackupPaused;
        item.label = isAutoBackupPaused ? 'Resume Automatic Backup' : 'Pause Automatic Backup';
        console.log(`[TrayAction] [${new Date().toISOString()}] Auto backup toggled to: ${isAutoBackupPaused ? 'PAUSED' : 'ACTIVE'}`);
      },
    },
    {
      label: 'Settings',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('app:navigate', 'settings');
        }
      },
    },
    {
      label: 'Rescan Storage Drives',
      click: async () => {
        console.log(`[TrayAction] [${new Date().toISOString()}] Action decided: Manual rescan triggered from tray context menu.`);
        if (tray) {
          tray.setToolTip('Dero Vault — Scanning storage drives...');
          console.log(`[Tray] [${new Date().toISOString()}] Tray state updated: Scanning storage drives...`);
        }
        await requestDriveRescan(SERVER_PORT, 'tray-menu-rescan');
      },
    },
    { type: 'separator' },
    {
      label: 'Exit Dero Vault',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', async () => {
    // If tray is in an error or prompt state, a single click triggers an immediate rescan
    const currentTip = tray.getToolTip ? tray.getToolTip() : '';
    if (currentTip.includes('click to') || currentTip.includes('Detection failed')) {
      console.log(`[TrayAction] [${new Date().toISOString()}] Tray clicked while in error/retry state. Triggering immediate rescan.`);
      tray.setToolTip('Dero Vault — Scanning storage drives...');
      await requestDriveRescan(SERVER_PORT, 'tray-click-rescan');
    }
  });

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('app:expand');
    }
  });

  tray.on('balloon-click', () => {
    console.log(`[TrayAction] [${new Date().toISOString()}] Tray balloon clicked. Opening Dero Vault window.`);
    if (mainWindow) {
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
    await ensureServerRunning();
    createWindow();
    createTray();
    subscribeToBackendEvents();

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

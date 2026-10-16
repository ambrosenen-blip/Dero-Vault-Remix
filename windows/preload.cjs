/**
 * Dero Vault — Electron Preload Bridge
 * Exposes native Windows dialogs and desktop window controls securely.
 */

const { contextBridge, ipcRenderer } = require('electron');

try {
  console.log(`[Preload] [${new Date().toISOString()}] Initializing electronAPI bridge in renderer context...`);

  contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    ping: () => 'pong',
    browseFolder: () => ipcRenderer.invoke('dialog:browseFolder'),
    minimizeToTray: () => ipcRenderer.invoke('window:minimizeToTray'),
    expandWindow: () => ipcRenderer.invoke('window:expand'),
    showNotification: (opts) => ipcRenderer.invoke('tray:notify', opts),
    closeApp: () => ipcRenderer.invoke('app:quit'),
    onExpand: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('app:expand', handler);
      return () => ipcRenderer.removeListener('app:expand', handler);
    },
    onOpenRegistration: (callback) => {
      const handler = (_event, drive) => {
        console.log(`[Preload] [${new Date().toISOString()}] drive:open-registration received from main process:`, drive ? drive.driveLetter : 'null');
        callback(drive);
      };
      ipcRenderer.on('drive:open-registration', handler);
      return () => ipcRenderer.removeListener('drive:open-registration', handler);
    },
    getPendingRegistrationDrive: () => ipcRenderer.invoke('app:getPendingRegistrationDrive'),
    clearPendingRegistrationDrive: () => ipcRenderer.invoke('app:clearPendingRegistrationDrive'),
    dismissRegistration: (stableHardwareId) => ipcRenderer.invoke('app:dismissRegistration', stableHardwareId),
  });

  console.log(`[Preload] [${new Date().toISOString()}] electronAPI bridge successfully exposed in main world.`);
} catch (err) {
  console.error(`[Preload] [${new Date().toISOString()}] FATAL error exposing electronAPI:`, err);
}

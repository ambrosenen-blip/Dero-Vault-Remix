/**
 * Dero Vault — Electron Preload Bridge
 * Exposes native Windows dialogs and desktop window controls securely.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
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
    const handler = (_event, drive) => callback(drive);
    ipcRenderer.on('drive:open-registration', handler);
    return () => ipcRenderer.removeListener('drive:open-registration', handler);
  },
  getPendingRegistrationDrive: () => ipcRenderer.invoke('app:getPendingRegistrationDrive'),
  clearPendingRegistrationDrive: () => ipcRenderer.invoke('app:clearPendingRegistrationDrive'),
  dismissRegistration: (stableHardwareId) => ipcRenderer.invoke('app:dismissRegistration', stableHardwareId),
});



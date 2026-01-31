const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  captureScreen: () => ipcRenderer.invoke('get-screen-capture'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  
  // Update System
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  onUpdateMsg: (callback) => ipcRenderer.on('update-msg', (_event, value) => callback(value))
});
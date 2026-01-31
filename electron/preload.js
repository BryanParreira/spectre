const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  captureScreen: () => ipcRenderer.invoke('get-screen-capture'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  
  setIgnoreMouse: (ignore) => ipcRenderer.invoke('set-ignore-mouse', ignore),
  setUndetectable: (state) => ipcRenderer.invoke('set-undetectable', state),

  onAppWokeUp: (callback) => ipcRenderer.on('app-woke-up', () => callback())
});
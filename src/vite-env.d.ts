/// <reference types="vite/client" />

interface ElectronAPI {
  // Core Features
  captureScreen: () => Promise<string>;
  quitApp: () => Promise<void>;

  // Update System
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  quitAndInstall: () => Promise<void>;
  onUpdateMsg: (callback: (msg: any) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
// src/vite-env.d.ts
/// <reference types="vite/client" />

interface ElectronAPI {
  captureScreen: () => Promise<string>;
  quitApp: () => Promise<void>;
  
  // --- Window & Mouse Control ---
  setIgnoreMouse: (ignore: boolean, options?: any) => Promise<void>;
  setWindowSize: (width: number, height: number) => Promise<void>;
  setUndetectable: (state: boolean) => Promise<void>;

  // --- Network ---
  proxyRequest: (options: { url: string; method: string; headers?: any; body?: any }) => Promise<{ status: number; data: any }>;

  // --- Updates ---
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  quitAndInstall: () => Promise<void>;
  onUpdateMsg: (callback: (msg: any) => void) => void;
  onAppWokeUp: (callback: () => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    // For Speech Recognition
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

// --- Module Declarations to Fix Build Errors ---

declare module 'react-syntax-highlighter' {
  export const Prism: any;
  export const Light: any;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism' {
  export const vscDarkPlus: any;
  const style: any;
  export default style;
}
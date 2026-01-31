const { app, BrowserWindow, ipcMain, desktopCapturer, globalShortcut, shell, Tray, Menu, nativeImage, session, systemPreferences } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;
let win;
let tray;

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function createWindow() {
  win = new BrowserWindow({
    width: 700,
    height: 520,
    x: 100, y: 100,
    alwaysOnTop: true,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: true,
    vibrancy: 'fullscreen-ui', 
    visualEffectState: 'active',
    skipTaskbar: true, 
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev
    }
  });

  win.setContentProtection(true);

  // --- PERMISSION HANDLERS (CRITICAL FOR MIC) ---
  
  // 1. Force Electron to approve audio/media requests
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'audio-capture', 'display-capture'];
    if (allowedPermissions.includes(permission)) {
      callback(true); // Approve automatically
    } else {
      callback(false);
    }
  });

  // 2. Explicitly check/ask for macOS Microphone access
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone');
    if (status === 'not-determined') {
      systemPreferences.askForMediaAccess('microphone');
    }
  }

  if (isDev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '../dist/index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  globalShortcut.register('CommandOrControl+Shift+Space', () => toggleWindow());
}

// --- TRAY ICON ---
function createTray() {
  const size = 22;
  const buffer = Buffer.alloc(size * size * 4);
  const center = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.abs(x - center) + Math.abs(y - center);
      if (dist <= 8) {
        const idx = (y * size + x) * 4;
        buffer[idx] = 255; buffer[idx+1] = 255; buffer[idx+2] = 255; 
        if (dist > 5) buffer[idx+3] = 255; 
        else buffer[idx+3] = 100; 
      }
    }
  }

  const icon = nativeImage.createFromBitmap(buffer, { width: size, height: size });
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip('Spectre AI');
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Toggle Spectre', click: toggleWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  
  tray.on('click', toggleWindow);
  tray.on('right-click', () => tray.popUpContextMenu(contextMenu));
}

function toggleWindow() {
  if (win.isVisible()) win.hide();
  else win.show();
}

ipcMain.handle('quit-app', () => app.quit());

ipcMain.handle('get-screen-capture', async () => {
  win.setOpacity(0);
  await new Promise(r => setTimeout(r, 200)); 
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
    win.setOpacity(1);
    return sources[0].thumbnail.toDataURL();
  } catch (e) {
    win.setOpacity(1);
    throw e;
  }
});

app.whenReady().then(() => { createWindow(); createTray(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
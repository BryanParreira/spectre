const { app, BrowserWindow, ipcMain, desktopCapturer, globalShortcut, shell, Tray, Menu, nativeImage, session, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;
let win;
let tray;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function createWindow() {
  win = new BrowserWindow({
    width: 800, // Wider for code viewing
    height: 600,
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
      devTools: isDev,
      webSecurity: true,
    }
  });

  win.setContentProtection(true);

  if (isDev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '../dist/index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // GOD MODE SHORTCUT: Cmd+Shift+G (Toggle Window)
  globalShortcut.register('CommandOrControl+Shift+G', () => {
    if (win.isVisible() && win.isFocused()) {
      win.hide();
    } else {
      win.show();
      win.focus();
      // Tell frontend we just woke up (to check clipboard)
      win.webContents.send('app-woke-up');
    }
  });
}

// Updater Logic
ipcMain.handle('check-for-updates', () => autoUpdater.checkForUpdates());
ipcMain.handle('download-update', () => autoUpdater.downloadUpdate());
ipcMain.handle('quit-and-install', () => autoUpdater.quitAndInstall());
autoUpdater.on('update-available', (info) => win.webContents.send('update-msg', { status: 'available', version: info.version }));
autoUpdater.on('download-progress', (p) => win.webContents.send('update-msg', { status: 'downloading', percent: p.percent }));
autoUpdater.on('update-downloaded', () => win.webContents.send('update-msg', { status: 'ready' }));

// Screen Capture
ipcMain.handle('get-screen-capture', async () => {
  win.setOpacity(0);
  await new Promise(r => setTimeout(r, 200)); 
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
    win.setOpacity(1);
    return sources[0].thumbnail.toDataURL();
  } catch (e) { win.setOpacity(1); throw e; }
});

ipcMain.handle('quit-app', () => app.quit());

// Tray
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
        if (dist > 5) buffer[idx+3] = 255; else buffer[idx+3] = 100; 
      }
    }
  }
  const icon = nativeImage.createFromBitmap(buffer, { width: size, height: size });
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Spectre AI');
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show/Hide (Cmd+Shift+G)', click: () => { if(win.isVisible()) win.hide(); else win.show(); } },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.on('click', () => { if(win.isVisible()) win.hide(); else win.show(); });
  tray.on('right-click', () => tray.popUpContextMenu(contextMenu));
}

app.whenReady().then(() => { createWindow(); createTray(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
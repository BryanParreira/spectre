const { app, BrowserWindow, ipcMain, desktopCapturer, globalShortcut, shell, Tray, Menu, nativeImage, screen, session, systemPreferences } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;
let win;
let tray;

async function checkMacPermissions() {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone');
    if (status === 'not-determined') await systemPreferences.askForMediaAccess('microphone');
  }
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width: width,
    height: height,
    x: 0, y: 0,
    type: 'panel', // Keeps it floating above other apps
    enableLargerThanScreen: true,
    hasShadow: false, // Critical: Remove window shadow so "invisible" areas don't show
    alwaysOnTop: true,
    transparent: true, // Critical: Allows CSS to handle transparency
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
      webSecurity: true,
      backgroundThrottling: false
    }
  });

  // Default: Ghost Mode (Click through the empty space)
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (isDev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '../dist/index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  session.defaultSession.setPermissionRequestHandler((_, perm, callback) => callback(true));
  
  globalShortcut.register('CommandOrControl+Shift+G', () => {
    if (win.isVisible()) win.hide(); else { win.show(); win.webContents.send('app-woke-up'); }
  });
}

// --- IPC HANDLERS ---

// 1. Mouse Passthrough (Allows clicking desktop behind the app)
ipcMain.handle('set-ignore-mouse', (event, ignore) => {
  if (win) {
    win.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

// 2. Undetectability
ipcMain.handle('set-undetectable', (event, state) => {
  if (win) win.setContentProtection(state);
});

// 3. System
ipcMain.handle('quit-app', () => app.quit());
ipcMain.handle('get-screen-capture', async () => {
  const wasVisible = win.isVisible();
  win.setOpacity(0);
  await new Promise(r => setTimeout(r, 150));
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
    win.setOpacity(1);
    return sources[0].thumbnail.toDataURL();
  } catch (e) {
    win.setOpacity(1);
    throw e;
  }
});

function createTray() {
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  buffer.fill(255); 
  const icon = nativeImage.createFromBitmap(buffer, { width: size, height: size });
  
  tray = new Tray(icon);
  tray.setToolTip('Spectre');
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Quit', click: () => app.quit() }]));
}

app.whenReady().then(async () => {
  await checkMacPermissions();
  createWindow();
  createTray();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
const { app, BrowserWindow, ipcMain, desktopCapturer, globalShortcut, shell, Menu, Tray, screen, session, systemPreferences, net, nativeImage } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;
let win;
let tray = null;

// --- UPDATE CONFIG ---
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Optimization flags
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

async function checkMacPermissions() {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone');
    if (status === 'not-determined') await systemPreferences.askForMediaAccess('microphone');
  }
}

function getIconPath() {
  let iconPath;
  if (isDev) {
    // In development, look in the local build folder
    iconPath = process.platform === 'win32' 
      ? path.join(__dirname, '../build/icon.ico') 
      : path.join(__dirname, '../build/icons/16x16.png');
  } else {
    // In production, look in resources (you must ensure icon is copied there or exists)
    // Fallback to searching in the app bundle if extraResources isn't set up
    iconPath = process.platform === 'win32'
      ? path.join(process.resourcesPath, 'icon.ico')
      : path.join(process.resourcesPath, 'icon.png');
      
    // Backup: try using the app root if resources path fails
    if (!require('fs').existsSync(iconPath)) {
        iconPath = path.join(app.getAppPath(), 'build/icon.ico');
    }
  }
  return iconPath;
}

function createTray() {
  const iconPath = getIconPath();
  
  try {
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon);
    
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show Aura', click: () => { win.show(); win.webContents.send('app-woke-up'); } },
      { label: 'Hide Aura', click: () => win.hide() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]);
    
    tray.setToolTip('Aura');
    tray.setContextMenu(contextMenu);
    
    tray.on('click', () => {
      if (win.isVisible()) {
          win.hide();
      } else { 
          win.show(); 
          win.webContents.send('app-woke-up'); 
      }
    });
  } catch (e) {
    console.log("Tray icon could not be loaded:", e);
  }
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width: width,
    height: height,
    x: 0, y: 0,
    type: 'panel', 
    enableLargerThanScreen: true,
    hasShadow: false,
    alwaysOnTop: true, // Default is pinned
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true, // Default hidden from taskbar
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
      webSecurity: true,
      backgroundThrottling: false
    }
  });

  win.setIgnoreMouseEvents(true, { forward: true });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setContentProtection(true);

  // --- SAFETY NET: Force interaction when focused ---
  // This ensures if you click the taskbar icon, the app becomes clickable
  win.on('focus', () => {
    win.setIgnoreMouseEvents(false);
  });

  if (isDev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '../dist/index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  session.defaultSession.setPermissionRequestHandler((_, perm, callback) => callback(true));
  
  globalShortcut.register('CommandOrControl+Shift+G', () => {
    if (win.isVisible()) { 
        win.hide(); 
    } else { 
        win.show(); 
        win.setSkipTaskbar(false); // Ensure it's findable when woken
        win.focus();
        win.webContents.send('app-woke-up'); 
    }
  });
}

// --- IPC HANDLERS ---

// UPDATED: Toggle Always on Top AND Taskbar Visibility
ipcMain.handle('toggle-always-on-top', (event, flag) => {
  if (win) {
    win.setAlwaysOnTop(flag, 'screen-saver');
    // If we UNPIN (flag is false), SHOW in taskbar so user can find it.
    // If we PIN (flag is true), HIDE from taskbar to stay invisible.
    win.setSkipTaskbar(flag); 
  }
});

ipcMain.handle('proxy-request', async (event, { url, method, headers, body }) => {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method });
    Object.keys(headers).forEach(key => request.setHeader(key, headers[key]));
    request.on('response', (response) => {
      let data = '';
      response.on('data', (chunk) => data += chunk);
      response.on('end', () => {
        try { resolve({ status: response.statusCode, data: JSON.parse(data) }); } 
        catch { resolve({ status: response.statusCode, data: {} }); }
      });
    });
    request.on('error', (error) => reject(error));
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
});

ipcMain.on('stream-request', (event, { url, method, headers, body, requestId }) => {
  const request = net.request({ url, method });
  Object.keys(headers).forEach(key => request.setHeader(key, headers[key]));
  
  request.on('response', (response) => {
    response.on('data', (chunk) => {
      if (!win.isDestroyed()) {
        win.webContents.send('stream-response', { requestId, chunk: chunk.toString(), done: false });
      }
    });
    
    response.on('end', () => {
      if (!win.isDestroyed()) {
        win.webContents.send('stream-response', { requestId, chunk: '', done: true });
      }
    });
  });

  request.on('error', (error) => {
    if (!win.isDestroyed()) {
      win.webContents.send('stream-response', { requestId, error: error.message, done: true });
    }
  });

  if (body) request.write(JSON.stringify(body));
  request.end();
});

ipcMain.handle('set-ignore-mouse', (event, ignore) => {
  if (win) win.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.handle('set-undetectable', (event, state) => {
  if (win) win.setContentProtection(state);
});

ipcMain.handle('quit-app', () => app.quit());

ipcMain.handle('get-screen-capture', async () => {
  const originalOpacity = win.getOpacity();
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

// --- UPDATE EVENTS ---
ipcMain.handle('check-for-updates', () => autoUpdater.checkForUpdates());
ipcMain.handle('quit-and-install', () => autoUpdater.quitAndInstall());

autoUpdater.on('update-available', () => {
  if(win) win.webContents.send('update-msg', { status: 'available' });
});
autoUpdater.on('download-progress', (progress) => {
  if(win) win.webContents.send('update-msg', { status: 'downloading', percent: progress.percent });
});
autoUpdater.on('update-downloaded', () => {
  if(win) win.webContents.send('update-msg', { status: 'ready' });
});
autoUpdater.on('update-not-available', () => {
  if(win) win.webContents.send('update-msg', { status: 'uptodate' });
});
autoUpdater.on('error', (err) => {
  if(win) win.webContents.send('update-msg', { status: 'error', error: err.message });
});

app.whenReady().then(async () => {
  await checkMacPermissions();
  createWindow();
  createTray();
  if (!isDev) autoUpdater.checkForUpdatesAndNotify(); 
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
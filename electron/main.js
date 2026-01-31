const { app, BrowserWindow, ipcMain, desktopCapturer, globalShortcut, shell, Menu, screen, session, systemPreferences, net } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;
let win;

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

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width: width,
    height: height,
    x: 0, y: 0,
    type: 'panel', 
    enableLargerThanScreen: true,
    hasShadow: false,
    alwaysOnTop: true,
    transparent: true,
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

  win.setIgnoreMouseEvents(true, { forward: true });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setContentProtection(true);

  if (isDev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '../dist/index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  session.defaultSession.setPermissionRequestHandler((_, perm, callback) => callback(true));
  
  globalShortcut.register('CommandOrControl+Shift+G', () => {
    if (win.isVisible()) { win.hide(); } else { win.show(); win.webContents.send('app-woke-up'); }
  });
}

// --- IPC HANDLERS ---

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

app.whenReady().then(async () => {
  await checkMacPermissions();
  createWindow();
  // Check for updates immediately on startup
  if (!isDev) autoUpdater.checkForUpdatesAndNotify(); 
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
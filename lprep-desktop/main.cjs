const { app, BrowserWindow, Menu, protocol, session, shell } = require('electron');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { START_URL, LIBRARY_URL, localAsset } = require('./assets.cjs');

app.setName('L-Prep');
protocol.registerSchemesAsPrivileged([{
  scheme: 'lprep',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, allowServiceWorkers: true }
}]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('activate', showWindow);
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(() => {
    const browserSession = session.defaultSession;
    browserSession.setPermissionCheckHandler(() => false);
    browserSession.setPermissionRequestHandler((_contents, _permission, answer) => answer(false));
    protocol.handle('lprep', serveAsset);
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
    showWindow();
  });
}

async function serveAsset(request) {
  const asset = request.method === 'GET' && localAsset(request.url);
  if (!asset) return new Response(null, { status: 404 });
  try {
    return new Response(await readFile(join(__dirname, 'web', asset.file)), { headers: asset.headers });
  } catch (error) {
    if (error.code === 'ENOENT') return new Response(null, { status: 404 });
    throw error;
  }
}

function showWindow() {
  if (!app.isReady()) return;
  const existing = BrowserWindow.getAllWindows()[0];
  if (existing) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return;
  }
  const window = new BrowserWindow({
    title: 'L-Prep',
    width: 1340,
    height: 900,
    minWidth: 640,
    minHeight: 500,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false
    }
  });
  const contents = window.webContents;
  contents.on('will-frame-navigate', request => {
    if (request.isMainFrame || request.url !== LIBRARY_URL) request.preventDefault();
  });
  for (const event of ['will-redirect', 'will-attach-webview']) {
    contents.on(event, request => request.preventDefault());
  }
  contents.setWindowOpenHandler(({ url }) => {
    // Official product links are opened by the OS outside the application.
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  void window.loadURL(START_URL);
}

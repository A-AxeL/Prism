// Prism desktop: the website's page in its own window, served from the app folder over app://, with automatic updates
// from GitHub Releases (electron-updater) and system details for the opt-in performance survey.
const {app, BrowserWindow, protocol, net, ipcMain, shell, Menu} = require('electron');
const path = require('node:path');
const os = require('node:os');
const {pathToFileURL} = require('node:url');
const {execFile} = require('node:child_process');
const {autoUpdater} = require('electron-updater');

// use the fast GPU on laptops with two, and keep WebGL on even for GPUs Chromium is unsure about
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

protocol.registerSchemesAsPrivileged([{scheme: 'app', privileges: {standard: true, secure: true, supportFetchAPI: true, stream: true}}]);
const root = path.join(__dirname, 'app');
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 480, minHeight: 360, backgroundColor: '#0d0f14', show: false, autoHideMenuBar: true,
    title: 'Prism', webPreferences: {preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false},
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL('app://prism/index.html');
  // links to other sites open in the browser
  win.webContents.setWindowOpenHandler(({url}) => { if (/^https?:/.test(url)) shell.openExternal(url); return {action: 'deny'}; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); shell.openExternal(url); } });
  win.on('enter-full-screen', () => win.setMenuBarVisibility(false));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('app', req => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root)) return new Response('Not found', {status: 404});
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  setupUpdates();
});
app.on('window-all-closed', () => app.quit());

// ---- updates: check at start and every 4 hours; download in the background; the page offers a restart when ready
function setupUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  const send = u => { if (win && !win.isDestroyed()) win.webContents.send('update', u); };
  autoUpdater.on('update-available', i => send({state: 'downloading', version: i.version}));
  autoUpdater.on('update-downloaded', i => send({state: 'ready', version: i.version}));
  autoUpdater.on('error', e => console.error('update check failed:', e && e.message));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 5000);
  setInterval(check, 4 * 3600 * 1000);
}
ipcMain.handle('install-update', () => autoUpdater.quitAndInstall(true, true));
ipcMain.handle('version', () => app.getVersion());

// ---- uploads for the performance survey (from the main process, so no browser CORS rules apply)
ipcMain.handle('post', async (_e, url, body) => {
  if (!/^https:\/\/script\.google\.com\//.test(url)) throw new Error('unexpected upload address');
  const r = await net.fetch(url, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body});
  return r.status;
});

// ---- system details for the performance survey (only gathered when the user runs it)
const ps = cmd => new Promise(res => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd],
  {timeout: 15000, windowsHide: true, maxBuffer: 4 << 20}, (err, out) => { try { res(err ? null : JSON.parse(out)); } catch (e) { res(null); } }));
const arr = v => v == null ? [] : Array.isArray(v) ? v : [v];
ipcMain.handle('system-info', async () => {
  const cpus = os.cpus();
  const o = {app: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome,
    os: {platform: process.platform, release: os.release(), arch: os.arch()},
    cpu: {model: cpus[0] && cpus[0].model.trim(), threads: cpus.length, mhz: cpus[0] && cpus[0].speed}, ramGB: +(os.totalmem() / 2 ** 30).toFixed(1)};
  try {
    const g = await app.getGPUInfo('complete');
    o.chromiumGpu = {devices: (g.gpuDevice || []).map(d => ({vendorId: d.vendorId, deviceId: d.deviceId, active: d.active, driverVendor: d.driverVendor, driverVersion: d.driverVersion})),
      glRenderer: g.auxAttributes && g.auxAttributes.glRenderer, angle: g.auxAttributes && g.auxAttributes.displayType};
  } catch (e) {}
  if (process.platform === 'win32') {
    const q = (cls, props) => `Get-CimInstance ${cls} | Select-Object ${props}`;
    const j = await ps('$o=@{' + [
      ['bios', q('Win32_BIOS', 'Manufacturer,SMBIOSBIOSVersion,ReleaseDate')],
      ['board', q('Win32_BaseBoard', 'Manufacturer,Product')],
      ['system', q('Win32_ComputerSystem', 'Manufacturer,Model')],
      ['cpu', q('Win32_Processor', 'Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed')],
      ['gpu', q('Win32_VideoController', 'Name,DriverVersion,DriverDate,AdapterRAM,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate')],
      ['os', q('Win32_OperatingSystem', 'Caption,Version,BuildNumber')],
      ['memory', q('Win32_PhysicalMemory', 'Capacity,Speed,SMBIOSMemoryType')],
    ].map(([k, c]) => `${k}=@(${c})`).join(';') + '};$o|ConvertTo-Json -Depth 4 -Compress');
    if (j) {
      const date = d => typeof d === 'string' && /Date\((\d+)/.test(d) ? new Date(+RegExp.$1).toISOString().slice(0, 10) : d;
      o.firmware = arr(j.bios).map(b => ({vendor: b.Manufacturer, version: b.SMBIOSBIOSVersion, date: date(b.ReleaseDate)}))[0];
      o.board = arr(j.board).map(b => ({vendor: b.Manufacturer, model: b.Product}))[0];
      o.system = arr(j.system).map(b => ({vendor: b.Manufacturer, model: b.Model}))[0];
      o.cpu.name = arr(j.cpu).map(c => c.Name && c.Name.trim())[0]; o.cpu.cores = arr(j.cpu).map(c => c.NumberOfCores)[0];
      o.gpu = arr(j.gpu).map(g => ({name: g.Name, driver: g.DriverVersion, driverDate: date(g.DriverDate), vramMB: g.AdapterRAM ? Math.round(g.AdapterRAM / 2 ** 20) : null,
        mode: g.CurrentHorizontalResolution ? `${g.CurrentHorizontalResolution}x${g.CurrentVerticalResolution}@${g.CurrentRefreshRate}` : null}));
      o.os.name = arr(j.os).map(x => `${x.Caption} ${x.Version}`)[0];
      o.memory = arr(j.memory).map(m => ({gb: Math.round(m.Capacity / 2 ** 30), mhz: m.Speed, type: m.SMBIOSMemoryType}));
    }
  }
  return o;
});

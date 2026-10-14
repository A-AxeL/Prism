// The bridge between the page and the desktop shell: system details for the performance survey, uploads, and updates.
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('prismDesktop', {
  version: () => ipcRenderer.invoke('version'),
  systemInfo: () => ipcRenderer.invoke('system-info'),
  post: (url, body) => ipcRenderer.invoke('post', url, body),
  onUpdate: fn => ipcRenderer.on('update', (_e, u) => fn(u)),
  install: () => ipcRenderer.invoke('install-update'),
});

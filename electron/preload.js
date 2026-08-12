const { contextBridge, ipcRenderer } = require('electron');

// Secure IPC gateway exposed to the renderer as `window.electronAPI`.
// Only channels with a matching ipcMain handler in main.js are surfaced here.
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (callback) => {
      const listener = (_event, isMaximized) => callback(isMaximized);
      ipcRenderer.on('window:maximize-changed', listener);
      return () => ipcRenderer.removeListener('window:maximize-changed', listener);
    },
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => process.platform,
  },
  notification: {
    show: (title, body) => ipcRenderer.invoke('notification:show', { title, body }),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },
  // Native menu / tray items dispatch here rather than navigating directly, so
  // routing stays owned by the renderer.
  onMenuAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('menu:action', listener);
    return () => ipcRenderer.removeListener('menu:action', listener);
  },
});

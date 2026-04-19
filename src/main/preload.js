const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
    removeListener: (channel, func) => ipcRenderer.removeListener(channel, func),
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  },
  scanSongFolders: (rootDir) => ipcRenderer.invoke('scan-song-folders', rootDir),
  scanCategories: (rootDir) => ipcRenderer.invoke('scan-categories', rootDir),
  readLabels: (labelsPath) => ipcRenderer.invoke('read-labels', labelsPath),
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  iniciarScraper: (url) => ipcRenderer.send('iniciar-scraper', url),
  onScraperFin: (callback) => ipcRenderer.on('scraper-fin', (event, msg) => callback(msg))
});

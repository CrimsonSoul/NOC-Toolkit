const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('nocListAPI', {
  loadExcelData: () => ipcRenderer.sendSync('load-excel-data'),
  openFile: (filename) => ipcRenderer.send('open-excel-file', filename),
  onExcelDataUpdate: (callback) => {
    if (typeof callback !== 'function') return () => {}

    const listener = (_event, data) => callback(data)
    ipcRenderer.on('excel-data-updated', listener)

    return () => ipcRenderer.removeListener('excel-data-updated', listener)
  },
  openExternal: (url) => ipcRenderer.invoke('open-external-link', url)
})

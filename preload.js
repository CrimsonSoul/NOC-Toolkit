const { contextBridge, ipcRenderer } = require('electron')

/**
 * Safely expose a minimal API surface to the renderer process.
 */
contextBridge.exposeInMainWorld('nocListAPI', {
  /**
   * Load Excel data asynchronously from the main process.
   * @returns {Promise<{emailData: any[], contactData: any[]}>}
   */
  loadExcelData: () => ipcRenderer.invoke('load-excel-data'),

  /**
   * Ask the main process to open an Excel file.
   * @param {string} filename
   */
  openFile: (filename) => ipcRenderer.send('open-excel-file', filename),

  /**
   * Listen for automatic Excel data updates.
   * @param {(data: {emailData: any[], contactData: any[]}) => void} callback
   */
  onExcelDataUpdate: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('excel-data-updated', handler)
    return () => ipcRenderer.off('excel-data-updated', handler)
  },

  /**
   * Listen for file watcher errors from the main process.
   * @param {(message: string) => void} callback
   */
  onExcelWatchError: (callback) => {
    const handler = (_event, message) => callback(message)
    ipcRenderer.on('excel-watch-error', handler)
    return () => ipcRenderer.off('excel-watch-error', handler)
  },

  /**
   * Listen for authentication challenges that require user credentials.
   * @param {(payload: any) => void} callback
   */
  onAuthChallenge: (callback) => {
    if (typeof callback !== 'function') {
      return () => {}
    }
    const channel = 'auth-challenge'
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.off(channel, handler)
  },

  /**
   * Provide credentials or cancel an authentication request.
   * @param {{id: number, username?: string, password?: string, cancel?: boolean}} payload
   */
  provideAuthCredentials: (payload) => ipcRenderer.invoke('auth-provide-credentials', payload),

  /**
   * Open an external URL in the user's default browser.
   * @param {string} url
   */
  openExternal: (url) => {
    try {
      const parsed = new URL(url)
      if (['http:', 'https:'].includes(parsed.protocol)) {
        return ipcRenderer.invoke('open-external-link', url)
      }
    } catch {
      // fall through to error
    }
    console.error(`Blocked external URL: ${url}`)
  },

  /**
   * Listen for dispatcher radar cache events from the main process.
   * @param {(result: {status: 'success' | 'error', message?: string}) => void} callback
   */
  onRadarCacheCleared: (callback) => {
    const channel = 'radar-cache-cleared'
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.off(channel, handler)
  },
})

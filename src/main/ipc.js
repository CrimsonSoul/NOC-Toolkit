const { ipcMain } = require('electron')
const { loadExcelFiles, openExcelFile, getCachedData } = require('./excel')
const { safeOpenExternalLink } = require('./utils')
const log = require('electron-log')

const pendingAuthRequests = new Map()

function setupIpcHandlers() {
  ipcMain.handle('load-excel-data', async () => getCachedData())

  ipcMain.handle('open-excel-file', async (_event, filename) => {
    try {
      return await openExcelFile(filename)
    } catch (error) {
      log.error('Failed to open Excel file:', error)
      return false
    }
  })

  ipcMain.handle('open-external-link', async (_event, url) => {
    await safeOpenExternalLink(url)
  })

  ipcMain.handle('auth-provide-credentials', async (_event, payload = {}) => {
    const { id, username, password, cancel } = payload

    if (typeof id !== 'number' || !pendingAuthRequests.has(id)) {
      return { status: 'error', message: 'Authentication request not found.' }
    }

    const entry = pendingAuthRequests.get(id)
    pendingAuthRequests.delete(id)

    try {
      if (cancel || !username) {
        entry.callback()
        return { status: 'cancelled' }
      }

      entry.callback(username, password ?? '')
      return { status: 'ok' }
    } catch (error) {
      log.error('Failed to resolve authentication request:', error)
      return { status: 'error', message: error?.message || String(error) }
    }
  })
}

module.exports = {
  setupIpcHandlers,
  pendingAuthRequests
}

const { app, BrowserWindow } = require('electron')
const log = require('electron-log')
const { loadExcelFiles, watchExcelFiles, closeWatcher } = require('./src/main/excel')
const { createWindow, setupApplicationMenu, getWin, __setWin } = require('./src/main/window')
const { setupIpcHandlers, pendingAuthRequests } = require('./src/main/ipc')

// Initialize logger
log.transports.file.level = 'info'
log.transports.console.level = 'info'

let authRequestIdCounter = 0

if (process.env.NODE_ENV !== 'test') {
  process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception in Main Process:', error)
  })

  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled Rejection in Main Process:', reason)
  })

  app.on('web-contents-created', (_event, contents) => {
    contents.on('destroyed', () => {
      // Cleanup auth requests
      for (const [id, entry] of pendingAuthRequests.entries()) {
        if (entry.contentsId === contents.id) {
          try {
            entry.callback()
          } catch (error) {
            log.error('Failed to cancel authentication request:', error)
          }
          pendingAuthRequests.delete(id)
        }
      }
    })
  })

  app.on('login', (event, webContents, request, authInfo, callback) => {
    event.preventDefault()

    if (!webContents || webContents.isDestroyed()) {
      callback()
      return
    }

    const sourceWindow = BrowserWindow.fromWebContents(webContents)
    if (!sourceWindow || sourceWindow.isDestroyed()) {
      callback()
      return
    }

    const requestId = ++authRequestIdCounter

    pendingAuthRequests.set(requestId, {
      callback,
      contentsId: webContents.id,
    })

    const payload = {
      id: requestId,
      url: request?.url || '',
      method: request?.method || '',
      referrer: request?.referrer || '',
      isProxy: !!authInfo?.isProxy,
      scheme: authInfo?.scheme || '',
      host: authInfo?.host || '',
      port: typeof authInfo?.port === 'number' ? authInfo.port : null,
      realm: authInfo?.realm || '',
      previousFailureCount: authInfo?.previousFailureCount || 0,
      usernameHint: authInfo?.username || '',
    }

    try {
      webContents.send('auth-challenge', payload)
    } catch (error) {
      log.error('Failed to forward authentication challenge:', error)
      pendingAuthRequests.delete(requestId)
      callback()
    }
  })

  app.whenReady().then(async () => {
    createWindow()
    setupApplicationMenu()
    setupIpcHandlers()
    const { sendExcelUpdate } = require('./src/main/excel')

    // Load initial data and update window
    await loadExcelFiles().then(() => {
        sendExcelUpdate()
    })

    watchExcelFiles()

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
        // Re-initialize watcher if needed
        await loadExcelFiles()
        watchExcelFiles()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    closeWatcher()
  })
}

// Exports for testing purposes or access from other modules if needed
module.exports = {
  watchExcelFiles,
  loadExcelFiles,
  __setWin: (w) => __setWin(w),
}

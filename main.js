const { app, BrowserWindow } = require('electron')
const log = require('electron-log')
const {
  loadExcelFiles,
  watchExcelFiles,
  closeWatcher,
  sendExcelUpdate,
} = require('./src/main/excel')
const { createWindow, setupApplicationMenu, __setWin } = require('./src/main/window')
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

    try {
      await loadExcelFiles()
      sendExcelUpdate()
    } catch (error) {
      log.error('Failed to load Excel data on startup:', error)
    }

    watchExcelFiles()

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
        try {
          await loadExcelFiles()
          sendExcelUpdate()
        } catch (error) {
          log.error('Failed to reload Excel data after activate:', error)
        }
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

module.exports = {
  watchExcelFiles,
  loadExcelFiles,
  __setWin: (w) => __setWin(w),
}

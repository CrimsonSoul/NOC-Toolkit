const { BrowserWindow, app, Menu, shell } = require('electron')
const path = require('path')
const { resolveWindowIcon, isDestroyed, getBasePath } = require('./utils')
const { sendExcelUpdate } = require('./excel')
const log = require('electron-log')

let win
const isMac = process.platform === 'darwin'

const getActiveWebContents = () => {
  if (!win || isDestroyed(win)) {
    return null
  }

  const contents = win.webContents
  if (!contents || isDestroyed(contents)) {
    return null
  }

  return contents
}

function handleRadarCacheRefresh() {
  const contents = getActiveWebContents()
  if (!contents) {
    return
  }

  const { session } = contents

  if (!session) {
    log.warn('Unable to clear radar cache: no active session found')
    return
  }

  const clearCachePromise = session.clearCache()
  const clearStoragePromise = session
    .clearStorageData({
      origin: 'https://cw-intra-web',
      storages: ['appcache', 'serviceworkers', 'caches'],
    })
    .catch(() => {})

  Promise.all([clearCachePromise, clearStoragePromise])
    .then(() => {
      contents.send('radar-cache-cleared', { status: 'success' })
    })
    .catch((error) => {
      log.error('Failed to clear radar cache:', error)
      contents.send('radar-cache-cleared', {
        status: 'error',
        message: error?.message || String(error),
      })
    })
}

function setupApplicationMenu() {
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' } : { role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [{ role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' }]
          : [{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      role: 'windowMenu',
      submenu: [
        { role: 'minimize' },
        ...(isMac ? [{ role: 'zoom' }] : []),
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }]
          : [{ role: 'close' }]),
        { type: 'separator' },
        {
          label: 'Clear Radar Cache and Reload',
          click: () => handleRadarCacheRefresh(),
        },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            await shell.openExternal('https://www.electronjs.org')
          },
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createWindow() {
  const windowIcon = resolveWindowIcon()
  const windowOptions = {
    width: 1000,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../../preload.js'),
      contextIsolation: true,
      sandbox: true
    }
  }

  if (windowIcon) {
    windowOptions.icon = windowIcon
  }

  win = new BrowserWindow(windowOptions)

  win.on('closed', () => {
    win = null
  })

  if (app.isPackaged) {
    win.loadFile(path.join(getBasePath(), 'dist', 'index.html'))
  } else {
    win.loadURL('http://localhost:5173/')
  }

  win.once('ready-to-show', () => {
    win.show()
    sendExcelUpdate()
  })
}

module.exports = {
  createWindow,
  getActiveWebContents,
  setupApplicationMenu,
  getWin: () => win,
  __setWin: (w) => (win = w)
}

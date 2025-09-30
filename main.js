const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const chokidar = require('chokidar')
const xlsx = require('xlsx')

// Base directory where Excel files live. In production this is next to the executable.
const basePath = app.isPackaged ? path.dirname(process.execPath) : __dirname

let win
let watcher
let cachedData = { emailData: [], contactData: [] }
const isMac = process.platform === 'darwin'

/**
 * Resolve an icon path for the application window if one exists.
 *
 * Electron expects the icon file to live alongside the executable in
 * production, but during development we keep the assets in the repo.
 * Some environments only provide an `.ico` file while others expect a
 * `.png`, so we search through a list of sensible locations and return
 * the first match. Returning `undefined` allows Electron to fall back to
 * its default icon instead of throwing an error when a custom icon is
 * missing.
 */
function resolveWindowIcon() {
  const candidatePaths = [
    path.join(basePath, 'icon.png'),
    path.join(basePath, 'icon.ico'),
    path.join(__dirname, 'public', 'icon.png'),
    path.join(__dirname, 'public', 'icon.ico'),
  ]

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return undefined
}

const DEBOUNCE_DELAY = 250
const pendingAuthRequests = new Map()
let authRequestIdCounter = 0

/**
 * Simple debounce helper to limit how often a function can run.
 */
function debounce(fn, delay) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Resolve file paths for the Excel spreadsheets.
 */
const getExcelPaths = () => ({
  groupsPath: path.join(basePath, 'groups.xlsx'),
  contactsPath: path.join(basePath, 'contacts.xlsx'),
})

const readWorkbookData = async ({
  filePath,
  sheetToJsonOptions,
  fallback,
  missingLogMessage,
  errorLogMessage,
}) => {
  if (!fs.existsSync(filePath)) {
    if (missingLogMessage) {
      console.warn(missingLogMessage)
    }
    return fallback
  }

  try {
    const buffer = await fs.promises.readFile(filePath)
    const workbook = xlsx.read(buffer, { type: 'buffer' })
    const [sheetName] = workbook.SheetNames || []

    if (sheetName && workbook.Sheets[sheetName]) {
      const sheet = workbook.Sheets[sheetName]
      const parsed = xlsx.utils.sheet_to_json(sheet, sheetToJsonOptions)
      return Array.isArray(parsed) ? parsed : []
    }

    return []
  } catch (error) {
    if (errorLogMessage) {
      console.error(errorLogMessage, error)
    } else {
      console.error(error)
    }
    return []
  }
}

/**
 * Read Excel sheets and cache the parsed data for quick access.
 *
 * @param {string} [changedFilePath] - optional full path to a specific Excel
 *   file that has changed. If provided, only that file is re-read and merged
 *   into the cached data.
 */
async function loadExcelFiles(changedFilePath) {
  const { groupsPath, contactsPath } = getExcelPaths()

  let nextEmailData = cachedData.emailData
  let nextContactData = cachedData.contactData

  const tasks = []

  if (!changedFilePath || changedFilePath === groupsPath) {
    tasks.push(
      readWorkbookData({
        filePath: groupsPath,
        sheetToJsonOptions: { header: 1 },
        fallback: nextEmailData,
        missingLogMessage: 'groups.xlsx not found; using cached group data',
        errorLogMessage: 'Error reading groups file:',
      }).then((data) => {
        nextEmailData = data
      }),
    )
  }

  if (!changedFilePath || changedFilePath === contactsPath) {
    tasks.push(
      readWorkbookData({
        filePath: contactsPath,
        fallback: nextContactData,
        missingLogMessage: 'contacts.xlsx not found; using cached contact data',
        errorLogMessage: 'Error reading contacts file:',
      }).then((data) => {
        nextContactData = data
      }),
    )
  }

  if (tasks.length > 0) {
    await Promise.all(tasks)
  }

  cachedData = {
    emailData: nextEmailData,
    contactData: nextContactData,
  }
}

/**
 * Send the latest cached Excel data to the renderer.
 */
function sendExcelUpdate() {
  if (!win) {
    return
  }

  if (typeof win.isDestroyed === 'function' && win.isDestroyed()) {
    return
  }

  const contents = win.webContents

  if (!contents) {
    return
  }

  if (typeof contents.isDestroyed === 'function' && contents.isDestroyed()) {
    return
  }

  contents.send('excel-data-updated', cachedData)
}

/**
 * Watch Excel files for changes and notify the renderer when updates occur.
 */
function watchExcelFiles(testWatcher) {
  const { groupsPath, contactsPath } = getExcelPaths()

  // If a watcher already exists, close it before creating a new one
  if (watcher) {
    watcher.close()
  }

  watcher = testWatcher || chokidar.watch([groupsPath, contactsPath], {
    persistent: true,
    ignoreInitial: true,
  })

  // Expose a cleanup function so callers/tests can stop watching explicitly
  const cleanup = () => {
    if (watcher) {
      watcher.close()
      watcher = null
    }
  }

  const debouncedOnChange = debounce((filePath) => {
    console.log(`File changed: ${filePath}`)
    loadExcelFiles(filePath)
      .then(() => {
        sendExcelUpdate()
      })
      .catch((error) => {
        console.error('Failed to reload Excel data after change:', error)
      })
  }, DEBOUNCE_DELAY)

  const debouncedOnUnlink = debounce((filePath) => {
    console.log(`File deleted: ${filePath}`)

    if (filePath === groupsPath) {
      cachedData = { ...cachedData, emailData: [] }
    } else if (filePath === contactsPath) {
      cachedData = { ...cachedData, contactData: [] }
    } else {
      cachedData = { emailData: [], contactData: [] }
    }

    sendExcelUpdate()
  }, DEBOUNCE_DELAY)

  const onError = (error) => {
    console.error('Watcher error:', error)
    if (win?.webContents) {
      win.webContents.send('excel-watch-error', error.message || String(error))
    }
    // Ensure we don't leave dangling listeners if an error occurs
    cleanup()
  }

  watcher.on('change', debouncedOnChange)
  watcher.on('add', debouncedOnChange)
  watcher.on('unlink', debouncedOnUnlink)
  watcher.on('error', onError)

  return cleanup
}

/**
 * Validate an external URL and open it if allowed.
 *
 * @param {string} url
 */
async function safeOpenExternalLink(url) {
  try {
    if (typeof url !== 'string') {
      throw new Error('URL must be a string')
    }

    const parsed = new URL(url)
    if (['http:', 'https:'].includes(parsed.protocol)) {
      await shell.openExternal(url)
      return
    }
  } catch {
    // fall through to error
  }
  console.error(`Blocked external URL: ${url}`)
}

/**
 * Create the main browser window.
 */
function createWindow() {
  const windowIcon = resolveWindowIcon()
  const windowOptions = {
    width: 1000,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false
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
    win.loadFile(path.join(__dirname, 'dist', 'index.html'))
  } else {
    win.loadURL('http://localhost:5173/')
  }

  win.once('ready-to-show', () => {
    win.show()
    sendExcelUpdate()
  })
}

function cleanupAuthRequestsForContents(contentsId) {
  for (const [id, entry] of pendingAuthRequests.entries()) {
    if (entry.contentsId === contentsId) {
      try {
        entry.callback()
      } catch (error) {
        console.error('Failed to cancel authentication request:', error)
      }
      pendingAuthRequests.delete(id)
    }
  }
}

function handleRadarCacheRefresh() {
  if (!win || win.isDestroyed()) {
    return
  }

  const { webContents } = win

  const clearCachePromise = webContents.session.clearCache()
  const clearStoragePromise = webContents.session
    .clearStorageData({
      origin: 'https://cw-intra-web',
      storages: ['appcache', 'serviceworkers', 'caches'],
    })
    .catch(() => {})

  Promise.all([clearCachePromise, clearStoragePromise])
    .then(() => {
      webContents.send('radar-cache-cleared', { status: 'success' })
    })
    .catch((error) => {
      console.error('Failed to clear radar cache:', error)
      webContents.send('radar-cache-cleared', {
        status: 'error',
        message: error?.message || String(error),
      })
    })
}

function setupApplicationMenu() {
  const { Menu } = require('electron')
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

if (process.env.NODE_ENV !== 'test') {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('destroyed', () => {
      cleanupAuthRequestsForContents(contents.id)
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
      console.error('Failed to forward authentication challenge:', error)
      pendingAuthRequests.delete(requestId)
      callback()
    }
  })

  app.whenReady().then(async () => {
    createWindow()
    setupApplicationMenu()
    await loadExcelFiles()
    watchExcelFiles()

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
        if (!watcher) {
          await loadExcelFiles()
          watchExcelFiles()
        }
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    if (watcher) {
      watcher.close()
    }
  })

  ipcMain.handle('load-excel-data', async () => cachedData)

  ipcMain.on('open-excel-file', (event, filename) => {
    const filePath = path.join(basePath, filename)
    if (fs.existsSync(filePath)) {
      shell.openPath(filePath)
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
      console.error('Failed to resolve authentication request:', error)
      return { status: 'error', message: error?.message || String(error) }
    }
  })
}

module.exports = {
  watchExcelFiles,
  loadExcelFiles,
  __setWin: (w) => (win = w),
  __setCachedData: (data) => (cachedData = data),
  getCachedData: () => cachedData,
  __testables: { loadExcelFiles, sendExcelUpdate, safeOpenExternalLink },
}

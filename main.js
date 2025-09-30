const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const chokidar = require('chokidar')
const xlsx = require('xlsx')

// Base directory where Excel files live. In production this is next to the executable.
const basePath = app.isPackaged ? path.dirname(process.execPath) : __dirname

const EXCEL_FILE_NAMES = {
  groups: 'groups.xlsx',
  contacts: 'contacts.xlsx',
}

const ALLOWED_EXCEL_FILENAMES = new Set(Object.values(EXCEL_FILE_NAMES))

let win
let watcher
let cachedData = { emailData: [], contactData: [] }
const workbookSignatures = { groups: null, contacts: null }
const isMac = process.platform === 'darwin'

const normalizePath = (filePath) => {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return null
  }

  try {
    const resolved = path.resolve(filePath)
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  } catch (error) {
    console.warn('Unable to normalize path:', filePath, error)
    return null
  }
}

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

const isDestroyed = (entity) =>
  Boolean(entity && typeof entity.isDestroyed === 'function' && entity.isDestroyed())

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
  groupsPath: path.join(basePath, EXCEL_FILE_NAMES.groups),
  contactsPath: path.join(basePath, EXCEL_FILE_NAMES.contacts),
})

function resolveExcelFilePath(filename) {
  if (typeof filename !== 'string') {
    return null
  }

  const normalized = path.basename(filename)
  if (!ALLOWED_EXCEL_FILENAMES.has(normalized)) {
    return null
  }

  return path.join(basePath, normalized)
}

function openExcelFile(filename) {
  const filePath = resolveExcelFilePath(filename)

  if (!filePath) {
    console.warn('Blocked attempt to open unexpected Excel file:', filename)
    return false
  }

  if (!fs.existsSync(filePath)) {
    console.warn(`Requested Excel file not found: ${filePath}`)
    return false
  }

  shell.openPath(filePath)
  return true
}

const readWorkbookData = async ({
  filePath,
  sheetToJsonOptions,
  fallback,
  fallbackSignature,
  missingLogMessage,
  errorLogMessage,
}) => {
  if (!fs.existsSync(filePath)) {
    if (missingLogMessage) {
      console.warn(missingLogMessage)
    }
    return { data: fallback, signature: fallbackSignature }
  }

  try {
    const buffer = await fs.promises.readFile(filePath)
    const signature = crypto.createHash('sha1').update(buffer).digest('hex')

    if (signature && signature === fallbackSignature && fallback) {
      return { data: fallback, signature }
    }

    const workbook = xlsx.read(buffer, { type: 'buffer' })
    const [sheetName] = workbook.SheetNames || []

    if (sheetName && workbook.Sheets[sheetName]) {
      const sheet = workbook.Sheets[sheetName]
      const parsed = xlsx.utils.sheet_to_json(sheet, sheetToJsonOptions)
      return { data: Array.isArray(parsed) ? parsed : [], signature }
    }

    return { data: [], signature }
  } catch (error) {
    if (errorLogMessage) {
      console.error(errorLogMessage, error)
    } else {
      console.error(error)
    }
    return { data: [], signature: fallbackSignature }
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

  const normalizedGroupsPath = normalizePath(groupsPath)
  const normalizedContactsPath = normalizePath(contactsPath)
  const normalizedChangedPath = normalizePath(changedFilePath)

  let nextEmailData = cachedData.emailData
  let nextContactData = cachedData.contactData
  let nextEmailSignature = workbookSignatures.groups
  let nextContactSignature = workbookSignatures.contacts

  const tasks = []

  const shouldReloadGroups =
    !normalizedChangedPath || normalizedChangedPath === normalizedGroupsPath

  if (shouldReloadGroups) {
    tasks.push(
      readWorkbookData({
        filePath: groupsPath,
        sheetToJsonOptions: { header: 1 },
        fallback: nextEmailData,
        fallbackSignature: workbookSignatures.groups,
        missingLogMessage: 'groups.xlsx not found; using cached group data',
        errorLogMessage: 'Error reading groups file:',
      }).then(({ data, signature }) => {
        nextEmailData = data
        nextEmailSignature = signature
      }),
    )
  }

  const shouldReloadContacts =
    !normalizedChangedPath || normalizedChangedPath === normalizedContactsPath

  if (shouldReloadContacts) {
    tasks.push(
      readWorkbookData({
        filePath: contactsPath,
        fallback: nextContactData,
        fallbackSignature: workbookSignatures.contacts,
        missingLogMessage: 'contacts.xlsx not found; using cached contact data',
        errorLogMessage: 'Error reading contacts file:',
      }).then(({ data, signature }) => {
        nextContactData = data
        nextContactSignature = signature
      }),
    )
  }

  if (tasks.length > 0) {
    await Promise.all(tasks)
  }

  const emailChanged =
    shouldReloadGroups && nextEmailSignature !== workbookSignatures.groups
  const contactChanged =
    shouldReloadContacts && nextContactSignature !== workbookSignatures.contacts

  if (emailChanged || contactChanged) {
    cachedData = {
      emailData: nextEmailData,
      contactData: nextContactData,
    }

    if (emailChanged) {
      workbookSignatures.groups = nextEmailSignature
    }

    if (contactChanged) {
      workbookSignatures.contacts = nextContactSignature
    }
  }

  return {
    emailChanged,
    contactChanged,
    didUpdate: emailChanged || contactChanged,
  }
}

/**
 * Send the latest cached Excel data to the renderer.
 */
function sendExcelUpdate() {
  const contents = getActiveWebContents()
  if (!contents) {
    return
  }

  contents.send('excel-data-updated', cachedData)
}

/**
 * Watch Excel files for changes and notify the renderer when updates occur.
 */
function watchExcelFiles(testWatcher) {
  const { groupsPath, contactsPath } = getExcelPaths()
  const normalizedGroupsPath = normalizePath(groupsPath)
  const normalizedContactsPath = normalizePath(contactsPath)

  // If a watcher already exists, close it before creating a new one
  if (watcher) {
    const previousWatcher = watcher
    watcher = null
    Promise.resolve(previousWatcher.close()).catch((error) => {
      console.error('Failed to close previous Excel watcher:', error)
    })
  }

  watcher =
    testWatcher ||
    chokidar.watch([groupsPath, contactsPath], {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 750,
        pollInterval: 100,
      },
      ignorePermissionErrors: true,
      depth: 0,
    })

  // Expose a cleanup function so callers/tests can stop watching explicitly
  const cleanup = () => {
    if (!watcher) {
      return
    }

    const closingWatcher = watcher
    watcher = null
    Promise.resolve(closingWatcher.close()).catch((error) => {
      console.error('Failed to close Excel watcher:', error)
    })
  }

  const debouncedOnChange = debounce((filePath) => {
    console.log(`File changed: ${filePath}`)
    loadExcelFiles(filePath)
      .then((result) => {
        if (result?.didUpdate) {
          sendExcelUpdate()
        }
      })
      .catch((error) => {
        console.error('Failed to reload Excel data after change:', error)
      })
  }, DEBOUNCE_DELAY)

  const debouncedOnUnlink = debounce((filePath) => {
    console.log(`File deleted: ${filePath}`)

    const normalizedPath = normalizePath(filePath)

    if (normalizedPath && normalizedPath === normalizedGroupsPath) {
      cachedData = { ...cachedData, emailData: [] }
      workbookSignatures.groups = null
    } else if (normalizedPath && normalizedPath === normalizedContactsPath) {
      cachedData = { ...cachedData, contactData: [] }
      workbookSignatures.contacts = null
    } else {
      cachedData = { emailData: [], contactData: [] }
      workbookSignatures.groups = null
      workbookSignatures.contacts = null
    }

    sendExcelUpdate()
  }, DEBOUNCE_DELAY)

  const onError = (error) => {
    console.error('Watcher error:', error)
    const contents = getActiveWebContents()
    if (contents) {
      contents.send('excel-watch-error', error.message || String(error))
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
  const contents = getActiveWebContents()
  if (!contents) {
    return
  }

  const { session } = contents

  if (!session) {
    console.warn('Unable to clear radar cache: no active session found')
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
      console.error('Failed to clear radar cache:', error)
      contents.send('radar-cache-cleared', {
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

  ipcMain.on('open-excel-file', (_event, filename) => {
    openExcelFile(filename)
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
  __setCachedData: (data) => {
    cachedData = data
    workbookSignatures.groups = null
    workbookSignatures.contacts = null
  },
  getCachedData: () => cachedData,
  __testables: { loadExcelFiles, sendExcelUpdate, safeOpenExternalLink, openExcelFile },
}

const { app, BrowserWindow } = require('electron')
const log = require('electron-log')
const { loadExcelFiles, watchExcelFiles, closeWatcher } = require('./src/main/excel')
const { createWindow, setupApplicationMenu, getWin, __setWin } = require('./src/main/window')
const { setupIpcHandlers, pendingAuthRequests } = require('./src/main/ipc')

// Initialize logger
log.transports.file.level = 'info'
log.transports.console.level = 'info'

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const readFileWithRetry = async (filePath, attempts = 3, delay = 500) => {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fs.promises.readFile(filePath)
    } catch (error) {
      if (error.code === 'EBUSY' && i < attempts - 1) {
        console.warn(`File locked, retrying in ${delay}ms: ${filePath}`)
        await sleep(delay)
        continue
      }
      throw error
    }
  }
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
    const buffer = await readFileWithRetry(filePath)
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

    if (changeFlushTimer) {
      clearTimeout(changeFlushTimer)
      changeFlushTimer = null
    }
    pendingChangedPaths.clear()

    const closingWatcher = watcher
    watcher = null
    Promise.resolve(closingWatcher.close()).catch((error) => {
      console.error('Failed to close Excel watcher:', error)
    })
  }

  const pendingChangedPaths = new Set()
  const UNKNOWN_CHANGE = Symbol('unknown-change')
  let changeFlushTimer = null

  const flushPendingChanges = () => {
    changeFlushTimer = null

    if (pendingChangedPaths.size === 0) {
      return
    }

    const hasGroupsChange = pendingChangedPaths.has(normalizedGroupsPath)
    const hasContactsChange = pendingChangedPaths.has(normalizedContactsPath)
    const hasUnknownChange = pendingChangedPaths.has(UNKNOWN_CHANGE)
    pendingChangedPaths.clear()

    const shouldReloadBoth = hasUnknownChange || (hasGroupsChange && hasContactsChange)
    const targetPath = shouldReloadBoth
      ? undefined
      : hasGroupsChange
        ? groupsPath
        : hasContactsChange
          ? contactsPath
          : undefined

    const logTarget = shouldReloadBoth
      ? 'multiple Excel files'
      : targetPath || 'an unknown Excel file'
    console.log(`File changed: ${logTarget}`)

    loadExcelFiles(targetPath)
      .then((result) => {
        if (result?.didUpdate) {
          sendExcelUpdate()
        }
      })
      .catch((error) => {
        console.error('Failed to reload Excel data after change:', error)
      })
  }

  const scheduleChangeFlush = () => {
    if (changeFlushTimer) {
      return
    }

    changeFlushTimer = setTimeout(flushPendingChanges, DEBOUNCE_DELAY)
  }

  const onChangeOrAdd = (filePath) => {
    const normalizedPath = normalizePath(filePath)
    if (normalizedPath) {
      pendingChangedPaths.add(normalizedPath)
    } else {
      pendingChangedPaths.add(UNKNOWN_CHANGE)
    }

    scheduleChangeFlush()
  }

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

  watcher.on('change', onChangeOrAdd)
  watcher.on('add', onChangeOrAdd)
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

  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled Rejection in Main Process:', reason)
  })

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
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception in Main Process:', error)
  })

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection in Main Process:', reason)
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

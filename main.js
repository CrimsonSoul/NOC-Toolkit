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

const DEBOUNCE_DELAY = 250

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

/**
 * Read Excel sheets and cache the parsed data for quick access.
 *
 * @param {string} [changedFilePath] - optional full path to a specific Excel
 *   file that has changed. If provided, only that file is re-read and merged
 *   into the cached data.
 */
async function loadExcelFiles(changedFilePath) {
  const { groupsPath, contactsPath } = getExcelPaths()

  if (!changedFilePath || changedFilePath === groupsPath) {
    if (fs.existsSync(groupsPath)) {
      try {
        const groupBuffer = await fs.promises.readFile(groupsPath)
        const groupWorkbook = xlsx.read(groupBuffer, { type: 'buffer' })
        const groupSheet = groupWorkbook.Sheets[groupWorkbook.SheetNames[0]]
        cachedData.emailData = xlsx.utils.sheet_to_json(groupSheet, { header: 1 })
      } catch (err) {
        console.error('Error reading groups file:', err)
      }
    } else {
      console.warn('groups.xlsx not found; using cached group data')
    }
  }

  if (!changedFilePath || changedFilePath === contactsPath) {
    if (fs.existsSync(contactsPath)) {
      try {
        const contactBuffer = await fs.promises.readFile(contactsPath)
        const contactWorkbook = xlsx.read(contactBuffer, { type: 'buffer' })
        const contactSheet = contactWorkbook.Sheets[contactWorkbook.SheetNames[0]]
        cachedData.contactData = xlsx.utils.sheet_to_json(contactSheet)
      } catch (err) {
        console.error('Error reading contacts file:', err)
      }
    } else {
      console.warn('contacts.xlsx not found; using cached contact data')
    }
  }
}

/**
 * Send the latest cached Excel data to the renderer.
 */
function sendExcelUpdate() {
  if (!win || !win.webContents) {
    return
  }
  win.webContents.send('excel-data-updated', cachedData)
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

  const debouncedOnChange = debounce(async (filePath) => {
    console.log(`File changed: ${filePath}`)
    await loadExcelFiles(filePath)
    sendExcelUpdate()
  }, DEBOUNCE_DELAY)

  const debouncedOnUnlink = debounce((filePath) => {
    console.log(`File deleted: ${filePath}`)
    cachedData = { emailData: [], contactData: [] }
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
  win = new BrowserWindow({
    width: 1000,
    height: 800,
    icon: path.join(basePath, 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false
    }
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

if (process.env.NODE_ENV !== 'test') {
  app.whenReady().then(async () => {
    createWindow()
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
}

module.exports = {
  watchExcelFiles,
  loadExcelFiles,
  __setWin: (w) => (win = w),
  __setCachedData: (data) => (cachedData = data),
  getCachedData: () => cachedData,
  __testables: { loadExcelFiles, sendExcelUpdate, safeOpenExternalLink },
}

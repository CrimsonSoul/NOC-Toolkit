const { app, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const chokidar = require('chokidar')
const xlsx = require('xlsx')
const log = require('electron-log')
const { getBasePath, normalizePath, sleep, debounce } = require('./utils')
const { getActiveWebContents } = require('./window')

const EXCEL_FILE_NAMES = {
  groups: 'groups.xlsx',
  contacts: 'contacts.xlsx',
}

const ALLOWED_EXCEL_FILENAMES = new Set(Object.values(EXCEL_FILE_NAMES))

let watcher
let cachedData = { emailData: [], contactData: [] }
const workbookSignatures = { groups: null, contacts: null }

const getExcelPaths = () => {
  const base = getBasePath()
  const resources = process.resourcesPath
  const execDir = path.dirname(process.execPath)

  const resolveExistingPath = (filename) => {
    const candidates = [base, resources, execDir].filter(Boolean)
    for (const candidate of candidates) {
      const fullPath = path.join(candidate, filename)
      if (fs.existsSync(fullPath)) {
        return fullPath
      }
    }

    return path.join(base, filename)
  }

  return {
    groupsPath: resolveExistingPath(EXCEL_FILE_NAMES.groups),
    contactsPath: resolveExistingPath(EXCEL_FILE_NAMES.contacts),
  }
}

function resolveExcelFilePath(filename) {
  if (typeof filename !== 'string') {
    return null
  }

  const normalized = path.basename(filename)
  if (!ALLOWED_EXCEL_FILENAMES.has(normalized)) {
    return null
  }

  const { groupsPath, contactsPath } = getExcelPaths()
  return normalized === EXCEL_FILE_NAMES.groups ? groupsPath : contactsPath
}

async function prepareExcelPathForOpening(filename) {
  const sourcePath = resolveExcelFilePath(filename)

  if (!sourcePath) {
    log.warn('Blocked attempt to open unexpected Excel file:', filename)
    return null
  }

  if (!fs.existsSync(sourcePath)) {
    log.warn(`Requested Excel file not found: ${sourcePath}`)
    return null
  }

  const needsExtraction = sourcePath.includes('.asar') || sourcePath.includes('.asar.unpacked')
  if (!needsExtraction) {
    return sourcePath
  }

  try {
    const cacheDir = path.join(app.getPath('userData'), 'excel-cache')
    await fs.promises.mkdir(cacheDir, { recursive: true })
    const cachedPath = path.join(cacheDir, path.basename(sourcePath))
    await fs.promises.copyFile(sourcePath, cachedPath)
    return cachedPath
  } catch (error) {
    log.error('Failed to extract Excel file from asar:', error)
    return sourcePath
  }
}

async function openExcelFile(filename) {
  const filePath = await prepareExcelPathForOpening(filename)

  if (!filePath) {
    return false
  }

  try {
    const result = await shell.openPath(filePath)

    if (typeof result === 'string' && result.trim().length > 0) {
      log.warn(`Failed to open Excel file: ${result}`)

      if (!filePath.includes('.asar')) {
        return false
      }

      const extractedPath = await prepareExcelPathForOpening(filename)
      if (extractedPath && extractedPath !== filePath) {
        const retryResult = await shell.openPath(extractedPath)
        if (typeof retryResult === 'string' && retryResult.trim().length > 0) {
          log.warn(`Retry failed to open Excel file: ${retryResult}`)
          return false
        }
        return true
      }

      return false
    }

    return true
  } catch (error) {
    log.error('Failed to open Excel file via shell:', error)
    return false
  }
}

const readFileWithRetry = async (filePath, attempts = 3, delay = 500) => {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fs.promises.readFile(filePath)
    } catch (error) {
      if (error.code === 'EBUSY' && i < attempts - 1) {
        log.warn(`File locked, retrying in ${delay}ms: ${filePath}`)
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
      log.warn(missingLogMessage)
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
      log.error(errorLogMessage, error)
    } else {
      log.error(error)
    }
    return { data: [], signature: fallbackSignature }
  }
}

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

function sendExcelUpdate() {
  const contents = getActiveWebContents()
  if (!contents) {
    return
  }

  contents.send('excel-data-updated', cachedData)
}

function watchExcelFiles(testWatcher) {
  const { groupsPath, contactsPath } = getExcelPaths()
  const normalizedGroupsPath = normalizePath(groupsPath)
  const normalizedContactsPath = normalizePath(contactsPath)
  const DEBOUNCE_DELAY = 250

  if (watcher) {
    const previousWatcher = watcher
    watcher = null
    Promise.resolve(previousWatcher.close()).catch((error) => {
      log.error('Failed to close previous Excel watcher:', error)
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
      log.error('Failed to close Excel watcher:', error)
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
    log.info(`File changed: ${logTarget}`)

    loadExcelFiles(targetPath)
      .then((result) => {
        if (result?.didUpdate) {
          sendExcelUpdate()
        }
      })
      .catch((error) => {
        log.error('Failed to reload Excel data after change:', error)
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
    log.info(`File deleted: ${filePath}`)

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
    log.error('Watcher error:', error)
    const contents = getActiveWebContents()
    if (contents) {
      contents.send('excel-watch-error', error.message || String(error))
    }
    cleanup()
  }

  watcher.on('change', onChangeOrAdd)
  watcher.on('add', onChangeOrAdd)
  watcher.on('unlink', debouncedOnUnlink)
  watcher.on('error', onError)

  return cleanup
}

const closeWatcher = () => {
  if (watcher) {
    watcher.close()
  }
}

module.exports = {
  loadExcelFiles,
  watchExcelFiles,
  closeWatcher,
  openExcelFile,
  sendExcelUpdate,
  getCachedData: () => cachedData,
  __setCachedData: (data) => {
    cachedData = data
    workbookSignatures.groups = null
    workbookSignatures.contacts = null
  },
}

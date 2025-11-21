const path = require('path')
const fs = require('fs')
const { shell, app } = require('electron')

let customBasePath = null

function getBasePath() {
  if (customBasePath) return customBasePath

  if (app.isPackaged) {
    try {
      return app.getAppPath()
    } catch (error) {
      console.warn('Falling back to executable directory for base path:', error)
      return path.dirname(process.execPath)
    }
  }

  return path.resolve(__dirname, '..', '..')
}

function setBasePath(p) {
  customBasePath = p
}

const basePath = getBasePath()

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

function resolveWindowIcon() {
  // We need to check relative to the app root (where main.js/package.json are)
  // Since we are in src/main, we need to go up two levels to get to root if we use __dirname
  // However, basePath is already set up to point to root in dev.

  const candidatePaths = [
    path.join(basePath, 'icon.png'),
    path.join(basePath, 'icon.ico'),
    path.join(basePath, 'public', 'icon.png'),
    path.join(basePath, 'public', 'icon.ico'),
  ]

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return undefined
}

function debounce(fn, delay) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isDestroyed = (entity) =>
  Boolean(entity && typeof entity.isDestroyed === 'function' && entity.isDestroyed())

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

module.exports = {
  basePath,
  getBasePath,
  setBasePath,
  normalizePath,
  resolveWindowIcon,
  debounce,
  sleep,
  isDestroyed,
  safeOpenExternalLink
}

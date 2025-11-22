import fs from 'fs'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'module'
import path from 'path'

const require = createRequire(import.meta.url)
const menuStub = {
  buildFromTemplate: vi.fn(() => ({})),
  setApplicationMenu: vi.fn(),
}

const electronStub = {
  app: { isPackaged: false },
  BrowserWindow: class {},
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  shell: { openExternal: vi.fn(), openPath: vi.fn() },
  Menu: menuStub,
}
require.cache[require.resolve('electron')] = { exports: electronStub }

// Mock electron-log
const logStub = {
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  transports: { file: {}, console: {} }
}
require.cache[require.resolve('electron-log')] = { exports: logStub }

// We rely on the mocked utils logic which sets basePath to test dir
const groupsPath = path.join(__dirname, 'groups.xlsx')
const contactsPath = path.join(__dirname, 'contacts.xlsx')

const excel = require('../../src/main/excel')
const utils = require('../../src/main/utils')
const windowMod = require('../../src/main/window')

// Force basePath to be the test directory
utils.setBasePath(__dirname)

const main = {
  ...excel,
  ...utils,
  ...windowMod,
  __setWin: windowMod.__setWin,
  __testables: {
    safeOpenExternalLink: utils.safeOpenExternalLink,
    openExcelFile: excel.openExcelFile
  }
}

let handlerMap
let fakeWatcher

beforeEach(() => {
  vi.restoreAllMocks()
  handlerMap = {}
  fakeWatcher = {
    on: (event, handler) => {
      handlerMap[event] = handler
    },
    close: vi.fn(),
  }
  vi.useFakeTimers()
  excel.__setCachedData({ emailData: [], contactData: [] })

  logStub.warn.mockClear()
  logStub.error.mockClear()
  logStub.info.mockClear()
})

describe('watchExcelFiles', () => {
  it('debounces change events', async () => {
    vi.useRealTimers()
    const sendSpy = vi.fn()
    main.__setWin({ webContents: { send: sendSpy } })

    const cleanup = main.watchExcelFiles(fakeWatcher)
    handlerMap.change(groupsPath)
    handlerMap.change(contactsPath)
    handlerMap.change(groupsPath)

    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(sendSpy).toHaveBeenCalledTimes(1)
    cleanup()
    vi.useFakeTimers()
  })

  it('debounces unlink events', async () => {
    vi.useRealTimers()
    const sendSpy = vi.fn()
    main.__setWin({ webContents: { send: sendSpy } })

    const cleanup = main.watchExcelFiles(fakeWatcher)
    handlerMap.unlink(groupsPath)
    handlerMap.unlink(contactsPath)
    handlerMap.unlink(groupsPath)

    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(sendSpy).toHaveBeenCalledTimes(1)
    cleanup()
    vi.useFakeTimers()
  })

  it('reloads both caches when both files change back-to-back', async () => {
    vi.useRealTimers()
    const sendSpy = vi.fn()
    main.__setWin({ webContents: { send: sendSpy } })
    excel.__setCachedData({ emailData: ['stale-email'], contactData: ['stale-contact'] })

    const cleanup = main.watchExcelFiles(fakeWatcher)

    handlerMap.change(groupsPath)
    handlerMap.change(contactsPath)

    await new Promise((resolve) => setTimeout(resolve, 400))

    const cached = main.getCachedData()
    expect(cached.emailData).not.toEqual(['stale-email'])
    expect(cached.contactData).not.toEqual(['stale-contact'])
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith('excel-data-updated', cached)

    cleanup()
    vi.useFakeTimers()
  })

  it('clears only cached email data when the groups file is deleted', async () => {
    const sendSpy = vi.fn()
    main.__setWin({ webContents: { send: sendSpy } })

    const initialContactData = [{ Name: 'Keep Me' }]
    excel.__setCachedData({ emailData: ['Delete Me'], contactData: initialContactData })

    const cleanup = main.watchExcelFiles(fakeWatcher)

    handlerMap.unlink(groupsPath)
    await vi.advanceTimersByTimeAsync(300)
    await Promise.resolve()

    expect(main.getCachedData().emailData).toEqual([])
    expect(main.getCachedData().contactData).toEqual(initialContactData)

    expect(sendSpy).toHaveBeenCalledWith('excel-data-updated', expect.objectContaining({
      emailData: [],
      contactData: initialContactData
    }))

    cleanup()
  })

  it('clears only cached contact data when the contacts file is deleted', async () => {
    const sendSpy = vi.fn()
    main.__setWin({ webContents: { send: sendSpy } })
    excel.__setCachedData({ emailData: ['cached-email'], contactData: ['cached-contact'] })

    const cleanup = main.watchExcelFiles(fakeWatcher)

    handlerMap.unlink(contactsPath)
    await vi.advanceTimersByTimeAsync(300)
    await Promise.resolve()

    expect(main.getCachedData()).toEqual({ emailData: ['cached-email'], contactData: [] })
    expect(sendSpy).toHaveBeenCalledWith('excel-data-updated', {
      emailData: ['cached-email'],
      contactData: [],
    })

    cleanup()
  })
})

describe('safeOpenExternalLink', () => {
  it('allows http and https URLs', async () => {
    electronStub.shell.openExternal.mockClear()

    await main.__testables.safeOpenExternalLink('https://example.com')
    await main.__testables.safeOpenExternalLink('http://example.com')

    expect(electronStub.shell.openExternal).toHaveBeenCalledTimes(2)
  })

  it('blocks other protocols and invalid URLs', async () => {
    electronStub.shell.openExternal.mockClear()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await main.__testables.safeOpenExternalLink('file:///etc/passwd')
    await main.__testables.safeOpenExternalLink('notaurl')

    expect(electronStub.shell.openExternal).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledTimes(2)
    errorSpy.mockRestore()
  })
})

describe('openExcelFile', () => {
  it('opens known Excel files', async () => {
    const openPathSpy = vi.spyOn(electronStub.shell, 'openPath').mockResolvedValue('')
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true)

    const result = await main.__testables.openExcelFile('groups.xlsx')

    expect(result).toBe(true)
    expect(openPathSpy).toHaveBeenCalledWith(groupsPath)

    openPathSpy.mockRestore()
    existsSpy.mockRestore()
  })

  it('blocks unexpected filenames', async () => {
    const openPathSpy = vi.spyOn(electronStub.shell, 'openPath')
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true)

    const result = await main.__testables.openExcelFile('../secrets.txt')

    expect(result).toBe(false)
    expect(openPathSpy).not.toHaveBeenCalled()
    expect(logStub.warn).toHaveBeenCalled()

    openPathSpy.mockRestore()
    existsSpy.mockRestore()
  })

  it('warns when the requested file is missing', async () => {
    const openPathSpy = vi.spyOn(electronStub.shell, 'openPath')
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    const result = await main.__testables.openExcelFile('contacts.xlsx')

    expect(result).toBe(false)
    expect(openPathSpy).not.toHaveBeenCalled()
    expect(logStub.warn).toHaveBeenCalledWith(
      expect.stringContaining('Requested Excel file not found'),
    )

    openPathSpy.mockRestore()
    existsSpy.mockRestore()
  })
})

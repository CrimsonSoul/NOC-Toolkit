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

const main = require('./main')

const groupsPath = path.join(__dirname, 'groups.xlsx')
const contactsPath = path.join(__dirname, 'contacts.xlsx')

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
  main.__setCachedData({ emailData: [], contactData: [] })
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

  it('returns a cleanup function that closes the watcher', () => {
    const cleanup = main.watchExcelFiles(fakeWatcher)
    cleanup()
    expect(fakeWatcher.close).toHaveBeenCalled()
  })

  it('closes the existing watcher when called again', () => {
    const firstWatcher = { on: vi.fn(), close: vi.fn() }
    const secondWatcher = { on: vi.fn(), close: vi.fn() }
    main.watchExcelFiles(firstWatcher)
    const cleanup = main.watchExcelFiles(secondWatcher)
    expect(firstWatcher.close).toHaveBeenCalled()
    cleanup()
  })

  it('closes the watcher on error', () => {
    const cleanup = main.watchExcelFiles(fakeWatcher)
    handlerMap.error(new Error('fail'))
    expect(fakeWatcher.close).toHaveBeenCalled()
    cleanup()
  })

  it('clears only cached email data when the groups file is deleted', async () => {
    const sendSpy = vi.fn()
    main.__setWin({ webContents: { send: sendSpy } })
    await main.loadExcelFiles()

    const initialContactData = main.getCachedData().contactData
    expect(initialContactData.length).toBeGreaterThan(0)

    const cleanup = main.watchExcelFiles(fakeWatcher)

    handlerMap.unlink(groupsPath)
    await vi.advanceTimersByTimeAsync(300)
    await Promise.resolve()

    expect(main.getCachedData()).toEqual({ emailData: [], contactData: initialContactData })
    expect(sendSpy).toHaveBeenCalledWith('excel-data-updated', {
      emailData: [],
      contactData: initialContactData,
    })

    cleanup()
  })

  it('clears only cached contact data when the contacts file is deleted', async () => {
    const sendSpy = vi.fn()
    main.__setWin({ webContents: { send: sendSpy } })
    main.__setCachedData({ emailData: ['cached-email'], contactData: ['cached-contact'] })

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

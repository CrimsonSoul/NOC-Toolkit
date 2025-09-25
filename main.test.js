import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'module'

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

let handlerMap
let fakeWatcher

beforeEach(() => {
  handlerMap = {}
  fakeWatcher = {
    on: (event, handler) => {
      handlerMap[event] = handler
    },
    close: vi.fn(),
  }
  vi.useFakeTimers()
})

describe('watchExcelFiles', () => {
  it('debounces change events', async () => {
    const sendSpy = vi.fn()
    main.__setWin({ webContents: { send: sendSpy } })

    const cleanup = main.watchExcelFiles(fakeWatcher)
    handlerMap.change('file1')
    handlerMap.change('file2')
    handlerMap.change('file3')

    await vi.advanceTimersByTimeAsync(300)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('debounces unlink events', async () => {
    const sendSpy = vi.fn()
    main.__setWin({ webContents: { send: sendSpy } })

    const cleanup = main.watchExcelFiles(fakeWatcher)
    handlerMap.unlink('file1')
    handlerMap.unlink('file2')
    handlerMap.unlink('file3')

    await vi.advanceTimersByTimeAsync(300)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    cleanup()
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

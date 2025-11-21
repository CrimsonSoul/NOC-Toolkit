/** @vitest-environment node */
import fs from 'fs'
import path from 'path'
import xlsx from 'xlsx'
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const electronPath = require.resolve('electron')
require.cache[electronPath] = {
  exports: {
    app: { isPackaged: false },
    BrowserWindow: vi.fn(),
    ipcMain: { on: vi.fn(), handle: vi.fn() },
    shell: {},
  },
}

// Mock electron-log
const logStub = {
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  transports: { file: {}, console: {} }
}
require.cache[require.resolve('electron-log')] = { exports: logStub }

const { loadExcelFiles, getCachedData, __setCachedData } = require('../../src/main/excel.js')
const { setBasePath } = require('../../src/main/utils.js')

// Force basePath to be the test directory
setBasePath(__dirname)

const groupsPath = path.join(__dirname, 'groups.xlsx')
const contactsPath = path.join(__dirname, 'contacts.xlsx')
const originalGroups = fs.existsSync(groupsPath) ? fs.readFileSync(groupsPath) : Buffer.from('')
const originalContacts = fs.existsSync(contactsPath) ? fs.readFileSync(contactsPath) : Buffer.from('')

afterAll(() => {
  if (originalGroups.length) fs.writeFileSync(groupsPath, originalGroups)
  if (originalContacts.length) fs.writeFileSync(contactsPath, originalContacts)
})

describe('incremental Excel loading', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    logStub.warn.mockClear()

    // Seed initial data for both files
    const groupWB = xlsx.utils.book_new()
    const groupSheet = xlsx.utils.aoa_to_sheet([['email'], ['initial@example.com']])
    xlsx.utils.book_append_sheet(groupWB, groupSheet, 'Sheet1')
    xlsx.writeFile(groupWB, groupsPath)

    const contactWB = xlsx.utils.book_new()
    const contactSheet = xlsx.utils.json_to_sheet([{ Name: 'Alice', Email: 'alice@example.com' }])
    xlsx.utils.book_append_sheet(contactWB, contactSheet, 'Sheet1')
    xlsx.writeFile(contactWB, contactsPath)

    __setCachedData({ emailData: [], contactData: [] })
    await loadExcelFiles()
  })

  it('updates only the modified workbook', async () => {
    const initial = getCachedData()
    expect(initial.contactData).toEqual([{ Name: 'Alice', Email: 'alice@example.com' }])
    expect(initial.emailData[1][0]).toBe('initial@example.com')

    // Modify contacts file only
    const newContactWB = xlsx.utils.book_new()
    const newContactSheet = xlsx.utils.json_to_sheet([{ Name: 'Bob', Email: 'bob@example.com' }])
    xlsx.utils.book_append_sheet(newContactWB, newContactSheet, 'Sheet1')
    xlsx.writeFile(newContactWB, contactsPath)

    await loadExcelFiles(contactsPath)

    const updated = getCachedData()
    // Email data remains the same
    expect(updated.emailData).toEqual(initial.emailData)
    // Contact data reflects new file
    expect(updated.contactData).toEqual([{ Name: 'Bob', Email: 'bob@example.com' }])
  })

  it('reports which workbook changed', async () => {
    const resultNoChange = await loadExcelFiles(groupsPath)
    expect(resultNoChange).toEqual({
      emailChanged: false,
      contactChanged: false,
      didUpdate: false,
    })

    const newContactWB = xlsx.utils.book_new()
    const newContactSheet = xlsx.utils.json_to_sheet([{ Name: 'Cara', Email: 'cara@example.com' }])
    xlsx.utils.book_append_sheet(newContactWB, newContactSheet, 'Sheet1')
    xlsx.writeFile(newContactWB, contactsPath)

    const resultContactChange = await loadExcelFiles(contactsPath)
    expect(resultContactChange).toEqual({
      emailChanged: false,
      contactChanged: true,
      didUpdate: true,
    })
  })

  it('retains cached data when groups file is missing', async () => {
    const initial = getCachedData()
    fs.unlinkSync(groupsPath)

    await loadExcelFiles(groupsPath)

    const updated = getCachedData()
    expect(updated.emailData).toEqual(initial.emailData)
    expect(logStub.warn).toHaveBeenCalledWith(
      expect.stringContaining('groups.xlsx not found')
    )
  })

  it('retains cached data when contacts file is missing', async () => {
    const initial = getCachedData()
    fs.unlinkSync(contactsPath)

    await loadExcelFiles(contactsPath)

    const updated = getCachedData()
    expect(updated.contactData).toEqual(initial.contactData)
    expect(logStub.warn).toHaveBeenCalledWith(
      expect.stringContaining('contacts.xlsx not found')
    )
  })
})

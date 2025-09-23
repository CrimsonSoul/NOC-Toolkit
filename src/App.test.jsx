import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import App from './App'

let originalFetch
let originalNocListAPI

beforeEach(() => {
  originalFetch = global.fetch
  originalNocListAPI = window.nocListAPI
})

afterEach(() => {
  global.fetch = originalFetch
  window.nocListAPI = originalNocListAPI
})

describe('App', () => {
  it('renders heading', () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
    )
    window.nocListAPI = {
      loadExcelData: async () => ({ emailData: [], contactData: [] }),
      onExcelDataUpdate: () => () => {},
      onExcelWatchError: () => () => {},
    }
    render(<App />)
    expect(screen.getByRole('heading', { name: /operations console/i })).toBeInTheDocument()
    expect(screen.getByText(/manage contacts, distribution groups/i)).toBeInTheDocument()
  })

  it('shows image when logo file is available', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    )
    window.nocListAPI = {
      loadExcelData: async () => ({ emailData: [], contactData: [] }),
      onExcelDataUpdate: () => () => {},
      onExcelWatchError: () => () => {},
    }
    render(<App />)
    expect(await screen.findByAltText(/noc list logo/i)).toBeInTheDocument()
  })
})

describe('Excel listener cleanup', () => {
  it('unregisters update listener on unmount', () => {
    const cleanup = vi.fn()
    const onExcelDataUpdate = vi.fn(() => cleanup)
    window.nocListAPI = {
      loadExcelData: async () => ({ emailData: [], contactData: [] }),
      onExcelDataUpdate,
      onExcelWatchError: () => () => {},
    }
    const { unmount } = render(<App />)
    unmount()
    expect(cleanup).toHaveBeenCalled()
  })
})

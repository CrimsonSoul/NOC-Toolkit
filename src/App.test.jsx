import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

vi.mock('./components/ContactSearch', () => ({
  __esModule: true,
  default: ({ addAdhocEmail }) => (
    <button
      type="button"
      onClick={() => addAdhocEmail('test.agent@example.com', { switchToEmailTab: true })}
    >
      Mock Add Contact
    </button>
  ),
}))

import App from './App'

let originalFetch
let originalNocListAPI

beforeEach(() => {
  originalFetch = global.fetch
  originalNocListAPI = window.nocListAPI
  localStorage.clear()
})

afterEach(() => {
  global.fetch = originalFetch
  window.nocListAPI = originalNocListAPI
})

describe('App', () => {
  it('renders fallback branding when logo is unavailable', () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
    )
    window.nocListAPI = {
      loadExcelData: async () => ({ emailData: [], contactData: [] }),
      onExcelDataUpdate: () => () => {},
      onExcelWatchError: () => () => {},
    }
    render(<App />)
    expect(screen.getByLabelText(/noc list logo/i)).toBeInTheDocument()
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

  it('adds a contact email to the ad-hoc list from contact search', async () => {
    const user = userEvent.setup()

    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
    )

    const loadExcelData = vi.fn().mockResolvedValue({
      emailData: [
        ['Group A'],
        ['group@example.com'],
      ],
      contactData: [
        {
          Name: 'Test Agent',
          Email: 'test.agent@example.com',
          Phone: '555-0000',
        },
      ],
    })

    window.nocListAPI = {
      loadExcelData,
      onExcelDataUpdate: () => () => {},
      onExcelWatchError: () => () => {},
      openFile: () => {},
      openExternal: () => {},
    }

    render(<App />)

    const [contactTab] = await screen.findAllByRole('tab', { name: /contact search/i })
    await user.click(contactTab)

    const addButton = await screen.findByRole('button', { name: /mock add contact/i })

    await user.click(addButton)

    const [emailTab] = await screen.findAllByRole('tab', { name: /email groups/i })
    await waitFor(() => expect(emailTab).toHaveAttribute('aria-selected', 'true'))

    expect(
      await screen.findByRole('listitem', { name: /test\.agent@example\.com/i })
    ).toBeInTheDocument()

    await new Promise((resolve) => setTimeout(resolve, 350))
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

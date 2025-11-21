import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { toast } from 'react-hot-toast'
import '@testing-library/jest-dom/vitest'

vi.mock('../../src/components/ContactSearch', () => ({
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

import App from '../../src/App'

let originalNocListAPI
let originalMatchMedia

beforeEach(() => {
  originalNocListAPI = window.nocListAPI
  originalMatchMedia = window.matchMedia

  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  }
  localStorage.clear()
})

afterEach(() => {
  window.nocListAPI = originalNocListAPI
  window.matchMedia = originalMatchMedia
})

describe('App', () => {
  it('renders application branding in the header', () => {
    window.nocListAPI = {
      loadExcelData: async () => ({ emailData: [], contactData: [] }),
      onExcelDataUpdate: () => () => {},
      onExcelWatchError: () => () => {},
    }

    render(<App />)

    expect(screen.getByLabelText(/noc toolkit/i)).toBeInTheDocument()
    expect(screen.getByText(/noc toolkit/i)).toBeInTheDocument()
  })

  it('handles a missing preload bridge without crashing', async () => {
    window.nocListAPI = undefined
    const toastErrorSpy = vi.spyOn(toast, 'error')

    try {
      render(<App />)

      const brandLabels = screen.getAllByLabelText(/noc toolkit/i)
      expect(brandLabels.length).toBeGreaterThan(0)

      await waitFor(() => {
        expect(toastErrorSpy).toHaveBeenCalledWith(
          expect.stringMatching(/unable to load excel data/i),
        )
      })
    } finally {
      toastErrorSpy.mockRestore()
    }
  })

  it('adds a contact email to the ad-hoc list from contact search', async () => {
    const user = userEvent.setup()

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

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

import Clock from './Clock'

const getTimeString = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const getDateString = (date) => date.toLocaleDateString()

describe('Clock', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders the current time and date', () => {
    const base = new Date('2024-05-01T08:24:00')
    vi.useFakeTimers()
    vi.setSystemTime(base)

    render(<Clock />)

    expect(screen.getByText(getTimeString(base))).toBeInTheDocument()
    expect(screen.getByText(getDateString(base))).toBeInTheDocument()
  })

  it('schedules and cleans up the refresh interval', () => {
    const base = new Date('2024-05-01T08:24:00')
    const advanced = new Date('2024-05-01T08:25:00')
    let call = 0
    const provider = vi.fn(() => {
      call += 1
      return call >= 3 ? advanced : base
    })

    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {})
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation((fn, delay) => {
      fn()
      return 123
    })

    const { unmount } = render(<Clock nowProvider={provider} refreshInterval={1500} />)

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1500)
    expect(provider.mock.calls.length).toBeGreaterThanOrEqual(2)

    unmount()
    expect(clearIntervalSpy).toHaveBeenCalledWith(123)
  })
})

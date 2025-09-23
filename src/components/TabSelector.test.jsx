import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi } from 'vitest'
import TabSelector from './TabSelector'

describe('TabSelector accessibility', () => {
  it('allows keyboard selection of tabs', () => {
    const setTab = vi.fn()
    render(<TabSelector tab="email" setTab={setTab} />)
    const contactTab = screen.getByRole('tab', { name: /contact search/i })
    contactTab.focus()
    fireEvent.keyDown(contactTab, { key: 'Enter', code: 'Enter' })
    expect(setTab).toHaveBeenCalledWith('contact')
  })
})

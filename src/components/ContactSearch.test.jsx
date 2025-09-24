import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, afterEach } from 'vitest'
import ContactSearch from './ContactSearch'

const contacts = Array.from({ length: 20 }, (_, i) => ({
  Name: `Agent ${i}`,
  Title: 'Agent',
  Email: `agent${i}@example.com`,
  Phone: 12345
}))

afterEach(() => cleanup())

describe('ContactSearch', () => {
  it('filters contacts without crashing on non-string values', () => {
    render(
      <ContactSearch contactData={contacts} addAdhocEmail={() => {}} />
    )
    const input = screen.getByPlaceholderText(/search contacts/i)
    fireEvent.change(input, { target: { value: 'Agent 1' } })
    expect(screen.getByText('Agent 1')).toBeInTheDocument()
  })

  it('virtualizes the contact list', () => {
    render(
      <ContactSearch contactData={contacts} addAdhocEmail={() => {}} />
    )
    const buttons = screen.getAllByText(/add to email list/i)
    expect(buttons.length).toBeLessThan(contacts.length)
  })

  it('supports keyboard navigation and add action', () => {
    const add = vi.fn()
    render(<ContactSearch contactData={contacts} addAdhocEmail={add} />)
    const input = screen.getByPlaceholderText(/search contacts/i)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const firstBtn = screen.getAllByText(/add to email list/i)[0]
    expect(firstBtn).toHaveFocus()
    fireEvent.keyDown(firstBtn, { key: 'ArrowDown' })
    const secondBtn = screen.getAllByText(/add to email list/i)[1]
    expect(secondBtn).toHaveFocus()
    fireEvent.click(secondBtn)
    expect(add).toHaveBeenCalledWith('agent1@example.com', { switchToEmailTab: true })
  })
})

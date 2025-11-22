import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
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
  it('filters contacts without crashing on malformed entries', () => {
    const mixedContacts = [...contacts, null, undefined, 42, 'invalid']

    render(
      <ContactSearch contactData={mixedContacts} addAdhocEmail={() => 'added'} />
    )
    const input = screen.getByPlaceholderText(/search contacts/i)
    fireEvent.change(input, { target: { value: 'Agent 1' } })
    expect(screen.getByText('Agent 1')).toBeInTheDocument()
  })

  it('renders the virtualized contact list viewport', () => {
    render(
      <ContactSearch contactData={contacts} addAdhocEmail={() => 'added'} />
    )
    const list = screen.getByRole('list', { name: /contact results/i })
    expect(list).toBeInTheDocument()
    const items = within(list).getAllByRole('listitem')
    expect(items.length).toBeGreaterThan(0)
  })

  it('supports keyboard navigation and add action', async () => {
    const add = vi.fn(() => 'added')
    render(<ContactSearch contactData={contacts} addAdhocEmail={add} />)
    const input = screen.getByPlaceholderText(/search contacts/i)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const buttonsAfterInput = await screen.findAllByRole('button', { name: /add to email list/i })
    const firstBtn = buttonsAfterInput[0]
    await new Promise((resolve) => setTimeout(resolve, 0))
    await waitFor(() => {
      const activeButton = document.activeElement
      expect(activeButton).toBe(firstBtn)
    })
    fireEvent.keyDown(firstBtn, { key: 'ArrowDown' })
    const buttonsAfterArrow = await screen.findAllByRole('button', { name: /add to email list/i })
    const secondBtn = buttonsAfterArrow[1]
    await new Promise((resolve) => setTimeout(resolve, 0))
    await waitFor(() => {
      const activeButton = document.activeElement
      expect(activeButton).toBe(secondBtn)
    })
    fireEvent.click(secondBtn)
    expect(add).toHaveBeenCalledWith('agent1@example.com', { switchToEmailTab: true })
  })

  it('extracts email from complex fields when adding to the list', () => {
    const add = vi.fn(() => 'added')
    const complexContacts = [
      {
        Name: 'Dana Contact',
        'Primary Email Address': 'Dana Contact <dana@example.com>',
      },
    ]

    render(<ContactSearch contactData={complexContacts} addAdhocEmail={add} />)

    const button = screen.getByText(/add to email list/i)
    fireEvent.click(button)

    expect(add).toHaveBeenCalledWith('dana@example.com', { switchToEmailTab: true })
  })
})

import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import EmailGroups from './EmailGroups'

const sampleData = [
  ['Group A', 'Group B'],
  ['a1@example.com', 'b1@example.com'],
  ['a2@example.com', '']
]

const sampleContacts = [
  { Name: 'Alex Johnson', Email: 'alex@example.com', Phone: '123-456-7890' },
  { Name: 'Bianca Rivers', Email: 'bianca@example.com' },
]

describe('EmailGroups', () => {
  afterEach(() => {
    cleanup()
  })
  it('shows count next to group name', () => {
    render(
      <EmailGroups
        emailData={sampleData}
        adhocEmails={[]}
        selectedGroups={[]}
        setSelectedGroups={() => {}}
        setAdhocEmails={() => {}}
        contactData={sampleContacts}
        addAdhocEmail={() => 'added'}
      />
    )
    const groupAButton = screen.getByRole('button', { name: /Group A/i })
    const groupBButton = screen.getByRole('button', { name: /Group B/i })
    expect(groupAButton).toHaveTextContent(/2\s+contacts/i)
    expect(groupBButton).toHaveTextContent(/1\s+contact/i)
  })

  it('allows selecting groups and clearing all', async () => {
    const user = userEvent.setup()

    function Wrapper() {
      const [selected, setSelected] = useState([])
      const [adhoc, setAdhoc] = useState([])
      return (
        <EmailGroups
          emailData={sampleData}
          adhocEmails={adhoc}
          selectedGroups={selected}
          setSelectedGroups={setSelected}
          setAdhocEmails={setAdhoc}
          contactData={sampleContacts}
          addAdhocEmail={() => 'added'}
        />
      )
    }

    render(<Wrapper />)
    const groupA = screen.getByRole('button', { name: /Group A/i })
    await user.click(groupA)
    expect(screen.getByRole('button', { name: /Group A/i })).toHaveClass('is-selected')
    const clear = screen.getByRole('button', {
      name: /Clear All/i,
    })
    await user.click(clear)
    expect(screen.getByRole('button', { name: /Group A/i })).not.toHaveClass('is-selected')
  })

  it('shows ad-hoc email chips and allows removing them', async () => {
    const user = userEvent.setup()

    function Wrapper() {
      const [selected, setSelected] = useState([])
      const [adhoc, setAdhoc] = useState(['solo@example.com'])
      return (
        <EmailGroups
          emailData={sampleData}
          adhocEmails={adhoc}
          selectedGroups={selected}
          setSelectedGroups={setSelected}
          setAdhocEmails={setAdhoc}
          contactData={sampleContacts}
          addAdhocEmail={() => 'added'}
        />
      )
    }

    render(<Wrapper />)
    const removeButton = screen.getByRole('listitem', { name: /solo@example.com/i })
    expect(removeButton).toBeInTheDocument()
    await user.click(removeButton)
    expect(
      screen.queryByRole('listitem', { name: /solo@example.com/i })
    ).not.toBeInTheDocument()
  })

  it('opens contact picker and filters contacts', async () => {
    const user = userEvent.setup()

    const addEmailMock = vi.fn().mockReturnValue('added')

    render(
      <EmailGroups
        emailData={sampleData}
        adhocEmails={[]}
        selectedGroups={[]}
        setSelectedGroups={() => {}}
        setAdhocEmails={() => {}}
        contactData={sampleContacts}
        addAdhocEmail={addEmailMock}
      />
    )

    await user.click(screen.getByRole('button', { name: /Add Individual Contacts/i }))

    const searchField = screen.getByPlaceholderText(/search contacts/i)
    await waitFor(() => expect(searchField).toHaveFocus())

    await user.type(searchField, 'Bianca')

    expect(screen.getByText('Bianca Rivers')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Add to List/i }))

    expect(addEmailMock).toHaveBeenCalledWith('bianca@example.com')
  })

  it('disables add button when the contact is already included', async () => {
    const user = userEvent.setup()

    render(
      <EmailGroups
        emailData={sampleData}
        adhocEmails={['bianca@example.com']}
        selectedGroups={[]}
        setSelectedGroups={() => {}}
        setAdhocEmails={() => {}}
        contactData={sampleContacts}
        addAdhocEmail={() => 'duplicate'}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Add Individual Contacts/i }))

    const disabledButton = await screen.findByRole('button', { name: /Already Added/i })
    expect(disabledButton).toBeDisabled()
  })
})

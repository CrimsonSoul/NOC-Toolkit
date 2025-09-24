import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import EmailGroups from './EmailGroups'

const sampleData = [
  ['Group A', 'Group B'],
  ['a1@example.com', 'b1@example.com'],
  ['a2@example.com', '']
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
})

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
    expect(screen.getByRole('button', { name: /Group A \(2\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Group B \(1\)/ })).toBeInTheDocument()
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
    const groupA = screen.getByRole('button', { name: /Group A \(2\)/ })
    await user.click(groupA)
    expect(screen.getByRole('button', { name: /Group A \(2\)/ })).toHaveClass('active')
    const clear = screen.getByRole('button', { name: /Clear All/i })
    await user.click(clear)
    expect(screen.getByRole('button', { name: /Group A \(2\)/ })).not.toHaveClass('active')
  })
})

import React from 'react'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import EmailGroups from './EmailGroups'

const sampleData = [
  ['Group A', 'Group B'],
  ['a1@example.com', 'b1@example.com'],
  ['a2@example.com', '']
]

describe('EmailGroups', () => {
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

  it('debounces search input', () => {
    vi.useFakeTimers()
    render(
      <EmailGroups
        emailData={sampleData}
        adhocEmails={[]}
        selectedGroups={[]}
        setSelectedGroups={() => {}}
        setAdhocEmails={() => {}}
      />
    )

    const search = screen.getAllByPlaceholderText(/Search groups/i)[0]
    fireEvent.change(search, { target: { value: 'Group B' } })

    // Immediately after typing, both buttons still visible
    expect(
      screen.getAllByRole('button', { name: /Group A \(2\)/ })[0]
    ).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(300)
    })

    // After debounce, only Group B remains
    const list = screen.getAllByTestId('group-list').pop()
    const groupButtonsAfter = within(list).getAllByRole('button')
    expect(
      groupButtonsAfter.some(btn => btn.textContent.includes('Group B'))
    ).toBe(true)

    vi.useRealTimers()
  })

  it('maintains selection and clear all with virtualization', () => {
    const Wrapper = () => {
      const [selectedGroups, setSelectedGroups] = React.useState([])
      const [adhocEmails, setAdhocEmails] = React.useState(['x@example.com'])
      return (
        <EmailGroups
          emailData={sampleData}
          adhocEmails={adhocEmails}
          selectedGroups={selectedGroups}
          setSelectedGroups={setSelectedGroups}
          setAdhocEmails={setAdhocEmails}
        />
      )
    }

    render(<Wrapper />)
    const groupButtons = screen.getAllByRole('button', {
      name: /Group A \(2\)/,
    })
    fireEvent.click(groupButtons[0])
    expect(
      screen.getByRole('button', { name: /Clear All/ })
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Clear All/ }))
    expect(
      screen.queryByRole('button', { name: /Clear All/ })
    ).not.toBeInTheDocument()
  })
})

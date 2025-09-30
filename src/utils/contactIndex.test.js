import { describe, it, expect } from 'vitest'
import { buildIndexedContacts, deriveContactKey } from './contactIndex'

describe('contactIndex utilities', () => {
  it('derives a stable key from known fields', () => {
    const contact = { Email: ' person@example.com ', Name: 'Person' }
    expect(deriveContactKey(contact, 0)).toBe('person@example.com')
  })

  it('falls back to index when no key fields present', () => {
    expect(deriveContactKey({}, 5)).toBe(5)
  })

  it('builds indexed contacts with formatted data', () => {
    const contacts = [
      {
        Name: 'Alex Smith',
        Title: 'Engineer',
        Email: 'alex@example.com',
        Phone: '(555) 123-4567',
      },
      null,
    ]

    const indexed = buildIndexedContacts(contacts)
    expect(indexed).toHaveLength(1)

    const [first] = indexed
    expect(first.key).toBe('alex@example.com')
    expect(first.email).toBe('alex@example.com')
    expect(first.initials).toBe('AS')
    expect(first.formattedPhone).toContain('+')
    expect(first.searchText).toContain('alex smith')
    expect(first.searchText).toContain('engineer')
  })
})

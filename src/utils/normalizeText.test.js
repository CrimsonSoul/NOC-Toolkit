import { describe, it, expect } from 'vitest'
import { normalizeSearchText } from './normalizeText'

describe('normalizeSearchText', () => {
  it('lowercases and trims primitive values', () => {
    expect(normalizeSearchText('  Mixed Case  ')).toBe('mixed case')
  })

  it('strips diacritics for easier matching', () => {
    expect(normalizeSearchText('Café Été')).toBe('cafe ete')
  })

  it('flattens arrays and nested objects', () => {
    const value = [' First ', { nested: 'Second Value' }, null]
    expect(normalizeSearchText(value)).toBe('first second value')
  })

  it('handles date objects gracefully', () => {
    const date = new Date('2020-01-01T12:34:56Z')
    expect(normalizeSearchText(date)).toContain('2020-01-01t12:34:56.000z')
  })
})

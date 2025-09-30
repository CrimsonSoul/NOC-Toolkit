import { findEmailAddress, getContactInitials } from './findEmailAddress'
import { getPreferredPhoneValue } from './contactInfo'
import { formatPhones } from './formatPhones'
import { normalizeSearchText } from './normalizeText'

const KEY_FIELDS = [
  'Email',
  'EmailAddress',
  'Email Address',
  'EmailAddress1',
  'Email Address 1',
  'Email1',
  'Email 1',
  'Primary Email',
  'Primary Email Address',
  'E-mail',
  'E-mail Address',
  'SMTP',
  'SMTP Address',
  'User Email',
  'Work Email',
  'Name',
]

/**
 * Determine a stable identifier for a contact record.
 * @param {Record<string, unknown>} contact
 * @param {number} fallbackIndex
 * @returns {string|number}
 */
export const deriveContactKey = (contact, fallbackIndex) => {
  if (!contact || typeof contact !== 'object') {
    return fallbackIndex
  }

  for (const field of KEY_FIELDS) {
    const value = contact[field]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) {
        return trimmed
      }
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return fallbackIndex
}

/**
 * Prepare contact data for fast lookups and display.
 * @param {Array<unknown>} contactData
 * @returns {Array<{
 *   raw: Record<string, unknown>,
 *   key: string|number,
 *   email: string,
 *   initials: string,
 *   phone: string,
 *   formattedPhone: string,
 *   searchText: string
 * }>}
 */
export const buildIndexedContacts = (contactData) => {
  if (!Array.isArray(contactData)) {
    return []
  }

  return contactData.reduce((acc, contact, index) => {
    if (!contact || typeof contact !== 'object') {
      return acc
    }

    const email = findEmailAddress(contact)
    const phoneValue = getPreferredPhoneValue(contact)
    const searchText = normalizeSearchText(Object.values(contact))

    acc.push({
      raw: contact,
      key: deriveContactKey(contact, index),
      email,
      initials: getContactInitials(contact?.Name),
      phone: phoneValue,
      formattedPhone: formatPhones(phoneValue),
      searchText,
    })

    return acc
  }, [])
}

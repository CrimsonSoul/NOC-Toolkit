export const PHONE_FIELDS = [
  'Phone',
  'PhoneNumber',
  'Phone Number',
  'Primary Phone',
  'Primary Phone Number',
  'Business Phone',
  'Business Phone Number',
  'Work Phone',
  'WorkPhone',
  'Mobile Phone',
  'MobilePhone',
  'Mobile',
  'Cell',
  'Cell Phone',
  'Telephone',
  'Tel',
]

/**
 * Retrieve the most relevant phone number value from a contact record.
 * @param {Record<string, unknown>|null|undefined} contact
 * @returns {string}
 */
export const getPreferredPhoneValue = (contact) => {
  if (!contact || typeof contact !== 'object') {
    return ''
  }

  for (const field of PHONE_FIELDS) {
    const value = contact[field]
    if (value != null && value !== '') {
      return value
    }
  }

  const fallback = contact.Phone
  return fallback == null ? '' : fallback
}

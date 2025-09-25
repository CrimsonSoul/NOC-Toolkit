const EMAIL_FIELDS = [
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
]

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

export const extractEmails = (value) => {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.flatMap(extractEmails)
  }
  if (typeof value === 'string') {
    const matches = value.match(EMAIL_PATTERN)
    return matches ? matches.map((match) => match.trim()) : []
  }
  return []
}

export const findEmailAddress = (contact = {}) => {
  for (const field of EMAIL_FIELDS) {
    const emails = extractEmails(contact[field])
    if (emails.length > 0) {
      return emails[0]
    }
  }

  for (const value of Object.values(contact)) {
    const emails = extractEmails(value)
    if (emails.length > 0) {
      return emails[0]
    }
  }

  return ''
}

export const getContactInitials = (name = '') => {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

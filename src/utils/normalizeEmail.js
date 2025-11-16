export const normalizeEmail = (email) => {
  if (typeof email !== 'string') {
    return null
  }

  const trimmed = email.trim()
  return trimmed ? trimmed.toLowerCase() : null
}

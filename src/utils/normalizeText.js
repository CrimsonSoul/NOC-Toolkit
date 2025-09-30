/**
 * Normalize strings for case-insensitive, accent-insensitive comparisons.
 * @param {unknown} value
 * @returns {string}
 */
export const normalizeSearchText = (value) => {
  if (value == null) {
    return ''
  }

  const stringValue = String(value)
  const normalized =
    typeof stringValue.normalize === 'function'
      ? stringValue.normalize('NFKD')
      : stringValue

  return normalized.toLowerCase().trim()
}

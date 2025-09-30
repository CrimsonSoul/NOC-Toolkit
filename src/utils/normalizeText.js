const WHITESPACE_REGEX = /\s+/g
const DIACRITIC_REGEX = /[\u0300-\u036f]/g

const normalizePrimitive = (value) => {
  if (value == null) {
    return ''
  }

  const stringValue = String(value)
  const normalized =
    typeof stringValue.normalize === 'function'
      ? stringValue.normalize('NFKD')
      : stringValue

  const withoutDiacritics = normalized.replace(DIACRITIC_REGEX, '')
  return withoutDiacritics.toLowerCase().replace(WHITESPACE_REGEX, ' ').trim()
}

const flattenNormalized = (value, parts) => {
  if (Array.isArray(value)) {
    value.forEach((entry) => flattenNormalized(entry, parts))
    return
  }

  if (value instanceof Date) {
    const normalized = normalizePrimitive(value.toISOString())
    if (normalized) {
      parts.push(normalized)
    }
    return
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((entry) => flattenNormalized(entry, parts))
    return
  }

  const normalized = normalizePrimitive(value)
  if (normalized) {
    parts.push(normalized)
  }
}

/**
 * Normalize values for case-insensitive, accent-insensitive comparisons.
 * Supports primitives, arrays, and nested objects by flattening their values.
 *
 * @param {unknown} value
 * @returns {string}
 */
export const normalizeSearchText = (value) => {
  const parts = []
  flattenNormalized(value, parts)
  return parts.join(' ')
}

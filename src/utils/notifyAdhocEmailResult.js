import { toast } from 'react-hot-toast'

/**
 * Display consistent toast feedback for ad-hoc email operations.
 * @param {string} email - The email address targeted by the action.
 * @param {'added' | 'duplicate' | 'invalid' | string} result - Result from addAdhocEmail.
 * @param {object} [options]
 * @param {string} [options.duplicateMessage]
 */
export const notifyAdhocEmailResult = (
  email,
  result,
  { duplicateMessage = 'Email already in list' } = {},
) => {
  if (!result) {
    return
  }

  if (result === 'added') {
    toast.success(`Added ${email} to the list`)
  } else if (result === 'duplicate') {
    toast(duplicateMessage, { icon: 'ℹ️' })
  } else if (result === 'invalid') {
    toast.error('Invalid email address')
  }
}

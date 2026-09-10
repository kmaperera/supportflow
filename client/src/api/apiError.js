// Only known public auth messages are displayed; arbitrary server text is not UI.
const publicMessages = new Set([
  'Invalid email or password', 'Invalid email or password.',
  'Your account is inactive. Please contact an administrator.',
  'Account is inactive', 'Validation failed',
  'Current password is incorrect', 'New password must be different from current password',
  'New password and confirmation do not match',
])

export function getApiErrorMessage(error, fallbackMessage) {
  if (error?.isAxiosError && !error.response) return 'Unable to connect to the server. Please try again.'
  const status = error?.response?.status
  const body = error?.response?.data
  if (status >= 400 && status < 500 && body?.success === false && publicMessages.has(body.message)) return body.message
  if (status === 401) return 'Your session could not be verified. Please sign in again.'
  if (status === 403) return 'You do not have permission to perform this action.'
  return fallbackMessage
}

export function getAuthFieldErrors(error, fields) {
  const body = error?.response?.data
  if (error?.response?.status !== 422 || body?.success !== false || !Array.isArray(body.errors)) return {}
  const labels = { email: 'email address', password: 'password', currentPassword: 'current password', newPassword: 'new password', confirmPassword: 'password confirmation' }
  const result = {}
  for (const item of body.errors) {
    if (fields.includes(item?.field) && Object.hasOwn(labels, item.field)) {
      result[item.field] = `Please check your ${labels[item.field]}.`
    }
  }
  return result
}

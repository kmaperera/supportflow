export function validatePasswordChange({ currentPassword, newPassword, confirmPassword }) {
  const errors = {}
  if (!currentPassword) errors.currentPassword = 'Enter your current password.'
  if (!newPassword) errors.newPassword = 'Enter a new password.'
  else if (Array.from(newPassword).length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    errors.newPassword = 'Use at least 8 characters with an uppercase letter, a lowercase letter, and a number.'
  } else if (newPassword === currentPassword) errors.newPassword = 'New password must be different from your current password.'
  if (!confirmPassword) errors.confirmPassword = 'Confirm your new password.'
  else if (confirmPassword !== newPassword) errors.confirmPassword = 'Passwords do not match.'
  return errors
}

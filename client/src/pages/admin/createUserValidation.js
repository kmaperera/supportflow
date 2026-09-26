export function validateCreateUser(values) {
  const errors = {}
  for (const [field, label] of [['firstName', 'First name'], ['lastName', 'Last name']]) {
    const length = Array.from(values[field].trim()).length
    if (!length || length > 100) errors[field] = `${label} must be 1 to 100 characters.`
  }
  if (Array.from(values.email.trim()).length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = 'Enter a valid email address.'
  if (!['EMPLOYEE', 'TECHNICIAN', 'ADMIN'].includes(values.role)) errors.role = 'Select a role.'
  if (Array.from(values.password).length < 8 || !/[A-Z]/.test(values.password) || !/[a-z]/.test(values.password) || !/[0-9]/.test(values.password)) errors.password = 'Use at least 8 characters with uppercase, lowercase, and a number.'
  if (!values.confirmPassword || values.confirmPassword !== values.password) errors.confirmPassword = 'Password confirmation must match.'
  if (Array.from(values.phone).length > 30) errors.phone = 'Phone must be at most 30 characters.'
  if (Array.from(values.department).length > 150) errors.department = 'Department must be at most 150 characters.'
  return errors
}

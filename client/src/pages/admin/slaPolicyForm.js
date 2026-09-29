export function validateSlaDurations(values) {
  const errors = {}
  for (const field of ['responseTimeMinutes', 'resolutionTimeMinutes']) {
    const value = String(values[field]).trim()
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 4294967295) errors[field] = 'Enter whole minutes from 1 to 4,294,967,295.'
  }
  if (!Object.keys(errors).length && Number(values.resolutionTimeMinutes) < Number(values.responseTimeMinutes)) errors.resolutionTimeMinutes = 'Resolution target must be at least the response target.'
  return errors
}
export function formatPolicyMinutes(value) {
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : ''].filter(Boolean).join(' ') || '0m'
}

export function validateReportDates(type, values) {
  const errors = {}
  for (const field of ['startDate', 'endDate']) {
    const value = values[field]
    if (!value) { if (type === 'date-range') errors[field] = 'This date is required.'; continue }
    const date = new Date(`${value}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01' || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || (field === 'endDate' && value === '9999-12-31')) errors[field] = 'Enter a valid supported calendar date.'
  }
  if (!errors.startDate && !errors.endDate && values.startDate && values.endDate && values.startDate > values.endDate) errors.endDate = 'End date must be on or after start date.'
  return errors
}

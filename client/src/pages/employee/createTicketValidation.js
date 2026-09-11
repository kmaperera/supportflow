import { getApiErrorMessage } from '../../api/apiError'

export function validateCreateTicket(values) {
  const errors = {}
  for (const [field, label, min, max] of [['title', 'Title', 5, 200], ['description', 'Description', 10, 5000]]) {
    const length = Array.from(values[field].trim()).length
    if (length < min || length > max) errors[field] = `${label} must be ${min} to ${max} characters.`
  }
  for (const [field, label] of [['categoryId', 'category'], ['priorityId', 'priority']]) {
    const id = String(values[field])
    if (!/^[1-9]\d*$/.test(id) || id.length > 20 || BigInt(id) > 18446744073709551615n) {
      errors[field] = `Select a ${label}.`
    }
  }
  return errors
}

export function getCreateTicketErrors(error) {
  const body = error?.response?.data
  const fields = {}
  const labels = { title: 'title', description: 'description', categoryId: 'category', priorityId: 'priority' }
  if (error?.response?.status === 422 && body?.success === false && Array.isArray(body.errors)) {
    for (const item of body.errors) {
      if (Object.hasOwn(labels, item?.field)) fields[item.field] = `Please check your ${labels[item.field]}.`
    }
  }
  const unavailable = {
    'Ticket category not found': 'categoryId', 'Selected ticket category is inactive': 'categoryId',
    'Ticket priority not found': 'priorityId', 'Selected ticket priority is inactive': 'priorityId',
  }
  if ([400, 404].includes(error?.response?.status) && body?.success === false && Object.hasOwn(unavailable, body.message)) {
    const field = unavailable[body.message]
    fields[field] = `This ${labels[field]} is no longer available. Select another.`
  }
  return { fields, message: Object.keys(fields).length ? 'Please review the highlighted fields.' :
    getApiErrorMessage(error, 'Unable to create your ticket. Please try again.') }
}

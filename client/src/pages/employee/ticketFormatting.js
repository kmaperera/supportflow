export const ticketStatuses = [
  { value: 'OPEN', label: 'Open', countField: 'openTickets' },
  { value: 'ASSIGNED', label: 'Assigned', countField: 'assignedTickets' },
  { value: 'IN_PROGRESS', label: 'In Progress', countField: 'inProgressTickets' },
  { value: 'WAITING_FOR_USER', label: 'Waiting for User', countField: 'waitingForUserTickets' },
  { value: 'RESOLVED', label: 'Resolved', countField: 'resolvedTickets' },
  { value: 'CLOSED', label: 'Closed', countField: 'closedTickets' },
  { value: 'REOPENED', label: 'Reopened', countField: 'reopenedTickets' },
]

export function formatTicketStatus(value) {
  return ticketStatuses.find(status => status.value === value)?.label || 'Unknown status'
}

export function formatTicketPriority(value) {
  if (typeof value !== 'string' || !value.trim()) return 'Not specified'
  const labels = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' }
  return labels[value.toUpperCase()] || value
}

export function formatTicketDate(value) {
  if (typeof value !== 'string' || !value.trim()) return 'Date unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

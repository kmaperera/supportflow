export function canManagePriority(ticket, userId) {
  return userId != null && ticket.assignedTo != null && String(ticket.assignedTo) === String(userId) && !['RESOLVED', 'CLOSED'].includes(ticket.status)
}

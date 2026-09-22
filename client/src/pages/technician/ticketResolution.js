export const canResolveTicket = (ticket, userId) => userId != null && ticket.assignedTo != null &&
  String(ticket.assignedTo) === String(userId) && ['IN_PROGRESS', 'WAITING_FOR_USER'].includes(ticket.status)

export function validateResolutionSummary(summary) {
  const length = Array.from(summary.trim()).length
  if (length === 0) return 'Resolution note is required.'
  return length < 10 || length > 5000 ? 'Enter a resolution note between 10 and 5,000 characters.' : null
}

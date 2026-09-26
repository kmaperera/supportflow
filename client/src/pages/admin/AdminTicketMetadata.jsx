import { formatTicketDate, formatTicketPriority, formatTicketStatus } from '../employee/ticketFormatting'

const personName = person => [person?.firstName, person?.lastName].filter(value => typeof value === 'string' && value.trim()).join(' ') || 'Not provided'
export default function AdminTicketMetadata({ ticket, detail = false }) {
  const fields = [['Requester', personName(ticket.creator)], ['Category', ticket.category?.name || 'Not specified'], ['Priority', formatTicketPriority(ticket.priority?.name)], ['Status', formatTicketStatus(ticket.status)], ['Assigned to', ticket.assignee ? personName(ticket.assignee) : 'Unassigned'], ['Created', formatTicketDate(ticket.createdAt)]]
  if (detail) fields.push(['Updated', formatTicketDate(ticket.updatedAt)])
  return <dl className="mt-4 grid min-w-0 gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3">{fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}</dl>
}

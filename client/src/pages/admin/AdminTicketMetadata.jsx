import { StatusBadge, PriorityBadge } from '../../components/Badges'
import MetadataList from '../../layouts/MetadataList'
import { formatTicketDate } from '../employee/ticketFormatting'

const personName = person => [person?.firstName, person?.lastName].filter(value => typeof value === 'string' && value.trim()).join(' ') || 'Not provided'
export default function AdminTicketMetadata({ ticket, detail = false }) {
  const fields = [['Requester', personName(ticket.creator)], ['Category', ticket.category?.name || 'Not specified'], ['Priority', <PriorityBadge key="priority" value={ticket.priority?.name} />], ['Status', <StatusBadge key="status" value={ticket.status} />], ['Assigned to', ticket.assignee ? personName(ticket.assignee) : 'Unassigned'], ['Created', formatTicketDate(ticket.createdAt)]]
  if (detail) fields.push(['Updated', formatTicketDate(ticket.updatedAt)])
  return <MetadataList fields={fields} />
}

import { StatusBadge } from '../../components/Badges'

const actions = {
  ASSIGNED: { label: 'Start Work', status: 'IN_PROGRESS' },
  IN_PROGRESS: { label: 'Wait for User', status: 'WAITING_FOR_USER' },
  WAITING_FOR_USER: { label: 'Resume Work', status: 'IN_PROGRESS' },
  REOPENED: { label: 'Resume Work', status: 'IN_PROGRESS' },
}

export default function TicketStatusActions({ ticket, userId, pending, onUpdate }) {
  const own = userId != null && ticket.assignedTo != null && String(ticket.assignedTo) === String(userId)
  const action = own ? actions[ticket.status] : null
  return <section aria-labelledby="ticket-status-actions-heading" className="min-w-0 layout-panel">
    <h2 id="ticket-status-actions-heading" className="text-lg font-semibold">Ticket Status</h2>
    <div className="mt-3 flex flex-wrap items-center gap-4">
      <p className="text-sm">Current status: <StatusBadge value={ticket.status} /></p>
      {action && <button type="button" disabled={pending} onClick={() => onUpdate(action.status)} className="min-h-11 cursor-pointer rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50">{pending ? 'Updating status...' : action.label}</button>}
    </div>
  </section>
}

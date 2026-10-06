import { StatusBadge, PriorityBadge } from '../../components/Badges'
import { Link } from 'react-router-dom'
import { formatTicketDate } from '../employee/ticketFormatting'

export default function TechnicianTicketCards({ tickets, renderAction }) {
  return <ul className="space-y-4">
    {tickets.map(ticket => {
      const requester = [ticket.creator?.firstName, ticket.creator?.lastName]
        .filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).join(' ') || 'Not provided'
      return <li key={ticket.id} className="relative min-w-0 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 transition-colors hover:border-teal-700 dark:hover:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950 sm:p-6">
        <Link to={`/technician/tickets/${encodeURIComponent(ticket.id)}`} aria-labelledby={`ticket-card-number-${ticket.id} ticket-card-title-${ticket.id}`} className="group block rounded-2xl after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-teal-700 dark:focus-visible:after:ring-teal-400 focus-visible:after:ring-offset-2">
          <span id={`ticket-card-number-${ticket.id}`} className="break-all text-sm font-semibold text-teal-800 dark:text-teal-300 group-hover:text-teal-950 dark:group-hover:text-teal-200">{ticket.ticketNumber}</span>
          <h2 id={`ticket-card-title-${ticket.id}`} className="mt-1 break-words text-lg font-semibold">{ticket.title}</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Requested by: {requester}</p>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
            {[['Category', ticket.category?.name || 'Not specified'], ['Priority', <PriorityBadge key="priority" value={ticket.priority?.name} />], ['Status', <StatusBadge key="status" value={ticket.status} />], ['Created', formatTicketDate(ticket.createdAt)]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-slate-500 dark:text-slate-400">{label}</dt><dd className={`mt-1 break-words ${label === 'Status' ? 'font-medium text-teal-900 dark:text-teal-200' : ''}`}>{value}</dd></div>)}
          </dl>
        </Link>
        {renderAction && <div className="relative z-10 mt-4 flex flex-col gap-3 border-t border-slate-200 dark:border-slate-700 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">{renderAction(ticket)}</div>}
      </li>
    })}
  </ul>
}

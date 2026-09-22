import { Link } from 'react-router-dom'
import { formatTicketDate, formatTicketPriority, formatTicketStatus } from '../employee/ticketFormatting'

export default function TechnicianTicketCards({ tickets, renderAction }) {
  return <ul className="space-y-4">
    {tickets.map(ticket => {
      const requester = [ticket.creator?.firstName, ticket.creator?.lastName]
        .filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).join(' ') || 'Not provided'
      return <li key={ticket.id} className="relative min-w-0 rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-teal-700 hover:bg-teal-50 sm:p-6">
        <Link to={`/technician/tickets/${encodeURIComponent(ticket.id)}`} aria-labelledby={`ticket-card-number-${ticket.id} ticket-card-title-${ticket.id}`} className="group block rounded-2xl after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-teal-700 focus-visible:after:ring-offset-2">
          <span id={`ticket-card-number-${ticket.id}`} className="break-all text-sm font-semibold text-teal-800 group-hover:text-teal-950">{ticket.ticketNumber}</span>
          <h2 id={`ticket-card-title-${ticket.id}`} className="mt-1 break-words text-lg font-semibold">{ticket.title}</h2>
          <p className="mt-2 text-sm text-slate-600">Requested by: {requester}</p>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
            {[['Category', ticket.category?.name || 'Not specified'], ['Priority', formatTicketPriority(ticket.priority?.name)], ['Status', formatTicketStatus(ticket.status)], ['Created', formatTicketDate(ticket.createdAt)]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className={`mt-1 break-words ${label === 'Status' ? 'font-medium text-teal-900' : ''}`}>{value}</dd></div>)}
          </dl>
        </Link>
        {renderAction && <div className="relative z-10 mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">{renderAction(ticket)}</div>}
      </li>
    })}
  </ul>
}

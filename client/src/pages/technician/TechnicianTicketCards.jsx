import { Link } from 'react-router-dom'
import { formatTicketDate, formatTicketPriority, formatTicketStatus } from '../employee/ticketFormatting'

export default function TechnicianTicketCards({ tickets, renderAction }) {
  return <ul className="space-y-4">
    {tickets.map(ticket => {
      const requester = [ticket.creator?.firstName, ticket.creator?.lastName]
        .filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).join(' ') || 'Not provided'
      return <li key={ticket.id} className="min-w-0">
        <Link to={`/technician/tickets/${encodeURIComponent(ticket.id)}`} aria-labelledby={`ticket-card-number-${ticket.id} ticket-card-title-${ticket.id}`} className="block rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-teal-700 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:p-6">
          <span id={`ticket-card-number-${ticket.id}`} className="text-sm font-semibold text-teal-800 underline underline-offset-4">{ticket.ticketNumber}</span>
          <h2 id={`ticket-card-title-${ticket.id}`} className="mt-1 text-lg font-semibold">{ticket.title}</h2>
          <p className="mt-2 text-sm text-slate-600">Requested by: {requester}</p>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
            {[['Category', ticket.category?.name || 'Not specified'], ['Priority', formatTicketPriority(ticket.priority?.name)], ['Status', formatTicketStatus(ticket.status)], ['Created', formatTicketDate(ticket.createdAt)]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}
          </dl>
        </Link>
        {renderAction && <div className="mt-2 flex flex-wrap items-center justify-end gap-3">{renderAction(ticket)}</div>}
      </li>
    })}
  </ul>
}

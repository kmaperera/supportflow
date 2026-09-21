import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { getTicketById } from '../../api/ticketApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'
import TicketStatusTimeline from './TicketStatusTimeline'
import TicketConversation from './TicketConversation'
import { formatTicketDate, formatTicketPriority, formatTicketStatus } from './ticketFormatting'

export default function TicketDetailsPage() {
  const { ticketId } = useParams()
  const { user } = useAuth()
  return <TicketDetails key={`${user?.id}:${ticketId}`} ticketId={ticketId} />
}

function TicketDetails({ ticketId }) {
  const [state, setState] = useState({ loading: true, ticket: null, error: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    getTicketById(ticketId, { signal: controller.signal }).then(ticket => {
      if (!controller.signal.aborted) setState({ loading: false, ticket, error: null })
    }).catch(error => {
      if (controller.signal.aborted) return
      const status = error?.response?.status
      const unavailable = [400, 403, 404, 422].includes(status)
      setState({ loading: false, ticket: null, unavailable, error: unavailable
        ? 'This ticket is not available. It may not exist or you may not have access.'
        : getApiErrorMessage(error, 'Unable to load this ticket.') })
    })
    return () => controller.abort()
  }, [ticketId, attempt])
  return <div className="space-y-6">
    <Link to="/employee/tickets" className="inline-block rounded text-sm font-semibold text-teal-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">Back to My Tickets</Link>
    {state.loading && <p role="status">Loading ticket...</p>}
    {state.error && <section className="space-y-3">
      <h1 className="text-2xl font-semibold">{state.unavailable ? 'Ticket unavailable' : 'Unable to load ticket'}</h1>
      <AuthFeedback>{state.error}</AuthFeedback>
      {!state.unavailable && <button type="button" onClick={() => { setState({ loading: true, ticket: null, error: null }); setAttempt(value => value + 1) }} className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2">Retry</button>}
    </section>}
    {state.ticket && <><TicketDetailsContent ticket={state.ticket} /><TicketStatusTimeline ticketId={ticketId} /><TicketConversation key={ticketId} ticketId={ticketId} status={state.ticket.status} /></>}
  </div>
}

export function TicketDetailsContent({ ticket }) {
  const technicianName = [ticket.assignee?.firstName, ticket.assignee?.lastName]
    .filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).join(' ')
  const metadata = [
    ['Category', ticket.category?.name || 'Not specified'],
    ['Assigned to', ticket.assignee ? technicianName || 'Assigned technician' : 'Unassigned'],
    ['Created', formatTicketDate(ticket.createdAt)],
    ['Updated', formatTicketDate(ticket.updatedAt)],
    ...(ticket.resolvedAt ? [['Resolved', formatTicketDate(ticket.resolvedAt)]] : []),
    ...(ticket.closedAt ? [['Closed', formatTicketDate(ticket.closedAt)]] : []),
  ]
  return <>
    <header className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
      <p className="break-all text-sm font-semibold text-teal-800">{ticket.ticketNumber}</p>
      <h1 className="mt-2 break-words text-2xl font-semibold">{ticket.title}</h1>
      <dl className="mt-4 flex flex-wrap gap-6 text-sm">
        <div><dt className="text-slate-500">Status</dt><dd className="mt-1 font-semibold text-teal-900">{formatTicketStatus(ticket.status)}</dd></div>
        <div><dt className="text-slate-500">Priority</dt><dd className="mt-1 font-semibold">{formatTicketPriority(ticket.priority?.name)}</dd></div>
      </dl>
    </header>
    <section aria-labelledby="ticket-metadata-heading" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
      <h2 id="ticket-metadata-heading" className="text-lg font-semibold">Ticket information</h2>
      <dl className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {metadata.map(([label, value]) => <div key={label}><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm">{value}</dd></div>)}
      </dl>
    </section>
    <section aria-labelledby="ticket-description-heading" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
      <h2 id="ticket-description-heading" className="text-lg font-semibold">Description</h2>
      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{ticket.description}</p>
    </section>
  </>
}

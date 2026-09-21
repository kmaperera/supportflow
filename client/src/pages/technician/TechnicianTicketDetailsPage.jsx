import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { getTicketById } from '../../api/ticketApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'
import TicketStatusTimeline from '../employee/TicketStatusTimeline'
import { formatTicketDate, formatTicketPriority, formatTicketStatus } from '../employee/ticketFormatting'

const actionClass = 'inline-flex min-h-11 items-center rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50'
const panelClass = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6'
const personName = person => [person?.firstName, person?.lastName].filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).join(' ')

export default function TechnicianTicketDetailsPage() {
  const { ticketId } = useParams()
  const { user } = useAuth()
  return <TicketWorkspace key={`${user?.id}:${ticketId}`} ticketId={ticketId} userId={user?.id} />
}

function TicketWorkspace({ ticketId, userId }) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    getTicketById(ticketId, { signal: controller.signal }).then(ticket => {
      if (!controller.signal.aborted) setResult({ attempt, ticket })
    }).catch(error => {
      if (controller.signal.aborted) return
      const unavailable = [400, 403, 404, 422].includes(error?.response?.status)
      setResult({ attempt, unavailable, error: unavailable ? 'Ticket not found or you do not have access to it.' : getApiErrorMessage(error, 'Unable to load this ticket.') })
    })
    return () => controller.abort()
  }, [ticketId, attempt])
  const current = result?.attempt === attempt ? result : null
  const unassigned = current?.ticket?.assignedTo === null
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link to={unassigned ? '/technician/tickets/unassigned' : '/technician/tickets/assigned'} className={actionClass}>{unassigned ? 'Back to Unassigned Queue' : 'Back to My Assigned Tickets'}</Link>
      {current?.ticket && <button type="button" className={actionClass} onClick={() => setAttempt(value => value + 1)}>Refresh</button>}
    </div>
    {!current && <p role="status">Loading ticket...</p>}
    {current?.error && <section className="space-y-3">
      <h1 className="text-2xl font-semibold">{current.unavailable ? 'Ticket unavailable' : 'Unable to load ticket'}</h1>
      <AuthFeedback>{current.error}</AuthFeedback>
      {!current.unavailable && <button type="button" className={actionClass} onClick={() => setAttempt(value => value + 1)}>Retry</button>}
    </section>}
    {current?.ticket && <>
      <TechnicianTicketDetailsContent ticket={current.ticket} userId={userId} />
      <TicketStatusTimeline key={`${ticketId}:${attempt}`} ticketId={ticketId} title="Status History" />
    </>}
  </div>
}

export function TechnicianTicketDetailsContent({ ticket, userId }) {
  const assignment = ticket.assignedTo === null ? 'Unassigned' : userId != null && String(ticket.assignedTo) === String(userId) ? 'Assigned to you' : 'Assigned elsewhere'
  const metadata = [
    ['Requester', personName(ticket.creator) || 'Not provided'],
    ['Category', ticket.category?.name || 'Not specified'],
    ['Assigned technician', ticket.assignedTo === null ? 'Unassigned' : personName(ticket.assignee) || 'Name unavailable'],
    ['Created', formatTicketDate(ticket.createdAt)],
    ['Updated', formatTicketDate(ticket.updatedAt)],
  ]
  return <>
    <header className={panelClass}>
      <p className="text-sm font-semibold text-teal-800">{ticket.ticketNumber}</p>
      <h1 className="mt-2 text-2xl font-semibold">{ticket.title}</h1>
      <p className="mt-3 text-sm font-medium">{assignment}</p>
      <dl className="mt-4 flex flex-wrap gap-6 text-sm">
        <div className="min-w-0"><dt className="text-slate-500">Status</dt><dd className="mt-1 font-semibold text-teal-900">{formatTicketStatus(ticket.status)}</dd></div>
        <div className="min-w-0"><dt className="text-slate-500">Priority</dt><dd className="mt-1 font-semibold">{formatTicketPriority(ticket.priority?.name)}</dd></div>
      </dl>
    </header>
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className={panelClass} aria-labelledby="workspace-description-heading">
        <h2 id="workspace-description-heading" className="text-lg font-semibold">Description</h2>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">{ticket.description}</p>
      </section>
      <section className={panelClass} aria-labelledby="workspace-information-heading">
        <h2 id="workspace-information-heading" className="text-lg font-semibold">Ticket information</h2>
        <dl className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
          {metadata.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>)}
        </dl>
      </section>
    </div>
  </>
}

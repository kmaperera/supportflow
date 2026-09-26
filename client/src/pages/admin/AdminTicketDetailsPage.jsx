import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTicketById } from '../../api/ticketApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'
import TicketStatusTimeline from '../employee/TicketStatusTimeline'
import AdminTicketMetadata from './AdminTicketMetadata'

export default function AdminTicketDetailsPage() {
  const { ticketId } = useParams()
  return <TicketDetails key={ticketId} ticketId={ticketId} />
}
function TicketDetails({ ticketId }) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    getTicketById(ticketId, { signal: controller.signal }).then(ticket => {
      if (!controller.signal.aborted) setResult({ attempt, ticket })
    }).catch(error => {
      if (controller.signal.aborted) return
      setResult({ attempt, error: [400, 403, 404, 422].includes(error?.response?.status) ? 'Ticket not found or you do not have access to it.' : getApiErrorMessage(error, 'Unable to load this ticket.') })
    })
    return () => controller.abort()
  }, [ticketId, attempt])
  const current = result?.attempt === attempt ? result : null
  const ticket = current?.ticket
  const action = 'inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2'
  return <div className="space-y-5">
    <Link className={action} to="/admin/tickets">Back to tickets</Link>
    <h1 className="text-2xl font-semibold">Ticket Details</h1>
    {!current && <p role="status">Loading ticket...</p>}
    {current?.error && <div className="space-y-3"><AuthFeedback>{current.error}</AuthFeedback><button className={action} onClick={() => setAttempt(value => value + 1)}>Retry</button></div>}
    {ticket && <>
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"><p className="break-all text-sm font-semibold text-teal-800">{ticket.ticketNumber}</p><h2 className="mt-1 break-words text-xl font-semibold">{ticket.title}</h2><AdminTicketMetadata ticket={ticket} detail /><h3 className="mt-6 font-semibold">Description</h3><p className="mt-2 whitespace-pre-wrap break-words text-slate-700">{ticket.description}</p></section>
      <TicketStatusTimeline ticketId={ticket.id} />
    </>}
  </div>
}

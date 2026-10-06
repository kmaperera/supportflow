import ErrorState from '../../components/ErrorState'
import ContentSkeleton from '../../components/ContentSkeleton'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTicketById } from '../../api/ticketApi'
import { getResourceError } from '../../api/apiError'
import TicketStatusTimeline from '../employee/TicketStatusTimeline'
import AdminTicketMetadata from './AdminTicketMetadata'
import AdminTicketAssignment from './AdminTicketAssignment'
import NotificationReadNotice from '../shared/NotificationReadNotice'

export default function AdminTicketDetailsPage() {
  const { ticketId } = useParams()
  return <TicketDetails key={ticketId} ticketId={ticketId} />
}
function TicketDetails({ ticketId }) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const [revision, setRevision] = useState(0)
  const [refreshError, setRefreshError] = useState(null)
  async function refresh() {
    setRevision(value => value + 1)
    try {
      const ticket = await getTicketById(ticketId)
      setResult({ attempt, ticket }); setRefreshError(null)
    } catch { setRefreshError('Unable to refresh ticket details. Please retry before making another change.') }
  }
  useEffect(() => {
    const controller = new AbortController()
    getTicketById(ticketId, { signal: controller.signal }).then(ticket => {
      if (!controller.signal.aborted) setResult({ attempt, ticket })
    }).catch(error => {
      if (controller.signal.aborted) return
      setResult({ attempt, ...getResourceError(error) })
    })
    return () => controller.abort()
  }, [ticketId, attempt])
  const current = result?.attempt === attempt ? result : null
  const ticket = current?.ticket
  const action = 'inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-teal-700 dark:border-teal-400 px-4 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950 focus-visible:outline-2 focus-visible:outline-offset-2'
  return <div className="layout-page">
    <NotificationReadNotice />
    <Link className={action} to="/admin/tickets">Back to tickets</Link>
    <h1 className="text-2xl font-semibold">Ticket Details</h1>
    {!current && <ContentSkeleton initial={!result && attempt === 0} variant="detail">Loading ticket...</ContentSkeleton>}
    {current?.error && <ErrorState title={current.errorTitle} message={current.error}>{!current.unavailable && <button className={action} onClick={() => setAttempt(value => value + 1)}>Retry</button>}</ErrorState>}
    {ticket && <>
      {refreshError && <ErrorState compact title="Unable to refresh ticket details" message={refreshError} onRetry={refresh} />}
      <section className="min-w-0 layout-panel"><p className="break-all text-sm font-semibold text-teal-800 dark:text-teal-300">{ticket.ticketNumber}</p><h2 className="mt-1 break-words text-xl font-semibold">{ticket.title}</h2><AdminTicketMetadata ticket={ticket} detail /><h3 className="mt-6 font-semibold">Description</h3><p className="mt-2 whitespace-pre-wrap break-words text-slate-700 dark:text-slate-200">{ticket.description}</p></section>
      {!refreshError && <AdminTicketAssignment ticket={ticket} refresh={refresh} />}
      <TicketStatusTimeline key={revision} ticketId={ticket.id} />
    </>}
  </div>
}

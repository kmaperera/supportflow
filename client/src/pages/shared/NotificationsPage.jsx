import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../../api/notificationApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'
import { formatTicketDate } from '../employee/ticketFormatting'

const buttonClass = 'inline-flex cursor-pointer items-center rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
const labels = { TICKET_CREATED: 'Ticket created', TICKET_ASSIGNED: 'Ticket assigned', TICKET_REASSIGNED: 'Ticket reassigned', TICKET_UNASSIGNED: 'Ticket unassigned', STATUS_CHANGED: 'Status changed', PRIORITY_CHANGED: 'Priority changed', PUBLIC_COMMENT: 'New reply', TICKET_RESOLVED: 'Ticket resolved', TICKET_REOPENED: 'Ticket reopened', TICKET_CLOSED: 'Ticket closed', SLA_WARNING: 'Support deadline approaching', SLA_BREACHED: 'Support deadline exceeded' }

export default function NotificationsPage() {
  const { user } = useAuth()
  return <Notifications key={`${user?.id}:${user?.role}`} technician={user?.role === 'TECHNICIAN'} />
}
function Notifications({ technician }) {
  const [request, setRequest] = useState({ page: 1, attempt: 0 })
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [pendingIds, setPendingIds] = useState([])
  const pending = useRef(new Set())
  const [markingAll, setMarkingAll] = useState(false)
  const allPending = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    getNotifications({ page: request.page, signal: controller.signal, allowInternal: technician }).then(data => {
      if (!controller.signal.aborted) setResult({ request, data })
    }).catch(cause => {
      if (!controller.signal.aborted) setResult({ request, error: getApiErrorMessage(cause, 'Unable to load notifications.') })
    })
    return () => controller.abort()
  }, [request, technician])
  const current = result?.request === request ? result : null
  async function markOne(id) {
    const key = String(id)
    if (pending.current.has(key) || allPending.current) return
    pending.current.add(key); setPendingIds([...pending.current]); setError(null)
    try {
      const notification = await markNotificationRead(id, { allowInternal: technician })
      setResult(previous => {
        if (!previous?.data || previous.request !== request) return previous
        const wasUnread = previous.data.notifications.some(item => String(item.id) === key && !item.isRead)
        return { ...previous, data: { ...previous.data, unreadCount: Math.max(0, previous.data.unreadCount - (wasUnread ? 1 : 0)), notifications: previous.data.notifications.map(item => String(item.id) === key ? notification : item) } }
      })
    } catch (cause) { setError(getApiErrorMessage(cause, 'Unable to mark notification as read. Please try again.')) }
    finally { pending.current.delete(key); setPendingIds([...pending.current]) }
  }
  async function markAll() {
    if (allPending.current || pending.current.size) return
    allPending.current = true; setMarkingAll(true); setError(null)
    try {
      await markAllNotificationsRead()
      // Re-read server state, including any notifications created during the mutation.
      setRequest(previous => ({ ...previous, attempt: previous.attempt + 1 }))
    } catch (cause) { setError(getApiErrorMessage(cause, 'Unable to mark notifications as read. Please try again.')) }
    finally { allPending.current = false; setMarkingAll(false) }
  }
  return <div className="space-y-5">
    <h1 className="text-2xl font-semibold">Notifications</h1>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-slate-600">{technician ? 'Updates about your support work and ticket activity.' : 'Updates about your support requests.'}</p><button type="button" className={buttonClass} disabled={!current || markingAll || pendingIds.length > 0} onClick={() => setRequest(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>Refresh</button></div>
    {error && <AuthFeedback>{error}</AuthFeedback>}
    {!current && <p role="status">Loading notifications...</p>}
    {current?.error && <div className="space-y-3"><AuthFeedback>{current.error}</AuthFeedback><button type="button" className={buttonClass} onClick={() => setRequest(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>Retry</button></div>}
    {current?.data && <>
      <div className="flex flex-wrap items-center gap-3"><p className="text-sm">{current.data.unreadCount} unread</p>{current.data.unreadCount > 0 && <button type="button" className={buttonClass} disabled={markingAll || pendingIds.length > 0} onClick={markAll}>{markingAll ? 'Marking as read...' : 'Mark all as read'}</button>}</div>
      {!current.data.notifications.length ? <p className="rounded-xl border border-slate-200 bg-white p-6">You don't have any notifications yet.</p> : <ul className="space-y-3">{current.data.notifications.map(item => item.type === 'INTERNAL_NOTE' && !technician ? null : <li key={item.id} className={`min-w-0 rounded-xl border p-5 ${item.isRead ? 'border-slate-200 bg-white' : 'border-teal-200 bg-teal-50'}`}>
        <p className="text-xs font-semibold text-slate-600">{item.isRead ? 'Read' : 'Unread'} · {item.type === 'INTERNAL_NOTE' ? 'Internal note' : labels[item.type] || 'Support update'}</p>
        <h2 className="mt-2 break-words font-semibold">{item.title}</h2>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{item.message}</p>
        <p className="mt-2 text-xs text-slate-500">{formatTicketDate(item.createdAt)}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {item.ticketId != null && /^[1-9]\d*$/.test(String(item.ticketId)) && <Link className={buttonClass} to={`/${technician ? 'technician' : 'employee'}/tickets/${encodeURIComponent(item.ticketId)}`}>View Ticket</Link>}
          {!item.isRead && <button type="button" className={buttonClass} disabled={markingAll || pendingIds.includes(String(item.id))} onClick={() => markOne(item.id)}>{pendingIds.includes(String(item.id)) ? 'Marking as read...' : 'Mark as read'}</button>}
        </div>
      </li>)}</ul>}
      {current.data.pagination.totalPages > 1 && <nav aria-label="Notification pagination" className="flex flex-wrap items-center gap-3">
        <button type="button" className={buttonClass} disabled={!current.data.pagination.hasPreviousPage || markingAll || pendingIds.length > 0} onClick={() => setRequest({ page: request.page - 1, attempt: 0 })}>Previous</button>
        <p className="text-sm">Page {current.data.pagination.page} of {current.data.pagination.totalPages}</p>
        <button type="button" className={buttonClass} disabled={!current.data.pagination.hasNextPage || markingAll || pendingIds.length > 0} onClick={() => setRequest({ page: request.page + 1, attempt: 0 })}>Next</button>
      </nav>}
    </>}
  </div>
}

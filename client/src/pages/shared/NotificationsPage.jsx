import { StateBadge } from '../../components/Badges'
import Pagination from '../../components/Pagination'
import { useToast } from '../../components/toastContext'
import ErrorState from '../../components/ErrorState'
import EmptyState from '../../components/EmptyState'
import ContentSkeleton from '../../components/ContentSkeleton'
import PageHeader from '../../layouts/PageHeader'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../../api/notificationApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'
import { formatTicketDate } from '../employee/ticketFormatting'
import { subscribeToNotifications } from '../../api/notificationRealtime'

const buttonClass = 'inline-flex cursor-pointer items-center rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
const labels = { TICKET_CREATED: 'Ticket created', TICKET_ASSIGNED: 'Ticket assigned', TICKET_REASSIGNED: 'Ticket reassigned', TICKET_UNASSIGNED: 'Ticket unassigned', STATUS_CHANGED: 'Status changed', PRIORITY_CHANGED: 'Priority changed', PUBLIC_COMMENT: 'New reply', TICKET_RESOLVED: 'Ticket resolved', TICKET_REOPENED: 'Ticket reopened', TICKET_CLOSED: 'Ticket closed', SLA_WARNING: 'Support deadline approaching', SLA_BREACHED: 'Support deadline exceeded' }

export default function NotificationsPage() {
  const { user, accessToken } = useAuth()
  return <Notifications key={`${user?.id}:${user?.role}`} role={user?.role} accessToken={accessToken} />
}
function Notifications({ role, accessToken }) {
  const toast = useToast()
  const technician = role === 'TECHNICIAN'
  const admin = role === 'ADMIN'
  const allowInternal = technician || admin
  const navigate = useNavigate()
  const active = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const [openingId, setOpeningId] = useState(null)
  const opening = useRef(false)
  const [request, setRequest] = useState({ page: 1, attempt: 0 })
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [pendingIds, setPendingIds] = useState([])
  const pending = useRef(new Set())
  const [markingAll, setMarkingAll] = useState(false)
  const allPending = useRef(false)
  const realtimeDirty = useRef(false)
  const refreshRealtime = useCallback(() => {
    if (!active.current) return
    if (pending.current.size || allPending.current || opening.current) { realtimeDirty.current = true; return }
    realtimeDirty.current = false
    setRequest(previous => ({ ...previous, attempt: previous.attempt + 1 }))
  }, [])
  // SLA events have no corresponding local mutation toast. Do not echo replies,
  // assignment or status events back to an actor who already received feedback.
  const notifyRealtime = useCallback(notification => {
    if (!allowInternal) return
    if (notification.type === 'SLA_WARNING') toast.warning('A support deadline is approaching. Check your notifications.')
    if (notification.type === 'SLA_BREACHED') toast.warning('A support deadline has been exceeded. Check your notifications.')
  }, [allowInternal, toast])
  useEffect(() => {
    if (!accessToken) return
    const origin = new URL(import.meta.env.VITE_API_BASE_URL || '/', window.location.href).origin
    return subscribeToNotifications({ token: accessToken, origin, onRefresh: refreshRealtime, onNotification: notifyRealtime })
  }, [accessToken, refreshRealtime, notifyRealtime])
  useEffect(() => {
    const controller = new AbortController()
    getNotifications({ page: request.page, signal: controller.signal, allowInternal }).then(data => {
      if (controller.signal.aborted) return
      const lastPage = Math.max(1, data.pagination.totalPages)
      if (request.page > lastPage) { setRequest(previous => previous === request ? { ...previous, page: lastPage } : previous); return }
      if (!controller.signal.aborted) setResult({ request, data })
    }).catch(cause => {
      if (!controller.signal.aborted) setResult({ request, error: getApiErrorMessage(cause, 'Unable to load notifications.') })
    })
    return () => controller.abort()
  }, [request, allowInternal])
  const current = result?.request === request ? result : null
  async function markOne(id) {
    const key = String(id)
    if (pending.current.has(key) || allPending.current) return
    pending.current.add(key); setPendingIds([...pending.current]); setError(null)
    try {
      const notification = await markNotificationRead(id, { allowInternal })
      if (!active.current) return
      setResult(previous => {
        if (!previous?.data || previous.request !== request) return previous
        const wasUnread = previous.data.notifications.some(item => String(item.id) === key && !item.isRead)
        return { ...previous, data: { ...previous.data, unreadCount: Math.max(0, previous.data.unreadCount - (wasUnread ? 1 : 0)), notifications: previous.data.notifications.map(item => String(item.id) === key ? notification : item) } }
      })
    } catch (cause) {
      const message = getApiErrorMessage(cause, 'Unable to mark notification as read. Please try again.')
      if (active.current) setError(message)
      return message
    }
    finally { pending.current.delete(key); if (active.current) { setPendingIds([...pending.current]); if (realtimeDirty.current) refreshRealtime() } }
  }
  async function viewTicket(item) {
    if (opening.current || pending.current.has(String(item.id)) || allPending.current) return
    opening.current = true
    setOpeningId(String(item.id))
    const readError = item.isRead ? null : await markOne(item.id)
    if (!active.current) return
    navigate(`/${admin ? 'admin' : technician ? 'technician' : 'employee'}/tickets/${encodeURIComponent(item.ticketId)}`, {
      state: readError ? { notificationReadError: true } : null,
    })
  }
  async function markAll() {
    if (allPending.current || pending.current.size) return
    allPending.current = true; setMarkingAll(true); setError(null)
    try {
      await markAllNotificationsRead()
      if (active.current) toast.success('All notifications marked as read.')
      if (!active.current) return
      // Re-read server state, including any notifications created during the mutation.
      setRequest(previous => ({ ...previous, attempt: previous.attempt + 1 }))
    } catch (cause) { if (active.current) setError(getApiErrorMessage(cause, 'Unable to mark notifications as read. Please try again.')) }
    finally { allPending.current = false; if (active.current) { setMarkingAll(false); if (realtimeDirty.current) refreshRealtime() } }
  }
  return <div className="layout-page">
    <PageHeader title="Notifications" />
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-slate-600">{admin ? 'Support activity notifications sent to your admin account.' : technician ? 'Updates about your support work and ticket activity.' : 'Updates about your support requests.'}</p><button type="button" className={buttonClass} disabled={!current || markingAll || pendingIds.length > 0} onClick={() => setRequest(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>Refresh</button></div>
    {error && <AuthFeedback>{error}</AuthFeedback>}
    {!current && <ContentSkeleton initial={!result} variant="cards">Loading notifications...</ContentSkeleton>}
    {current?.error && <ErrorState title="Unable to load notifications" message={<>{current.error}</>}><button type="button" className={buttonClass} onClick={() => setRequest(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>Retry</button></ErrorState>}
    {current?.data && <>
      <div className="flex flex-wrap items-center gap-3"><p className="text-sm">{current.data.unreadCount} unread</p>{current.data.unreadCount > 0 && <button type="button" className={buttonClass} disabled={markingAll || pendingIds.length > 0} onClick={markAll}>{markingAll ? 'Marking as read...' : 'Mark all as read'}</button>}</div>
      {!current.data.notifications.length ? <EmptyState compact title="No notifications yet." /> : <ul className="space-y-3">{current.data.notifications.map(item => item.type === 'INTERNAL_NOTE' && !allowInternal ? null : <li key={item.id} className={`min-w-0 rounded-xl border p-5 ${item.isRead ? 'border-slate-200 bg-white' : 'border-teal-200 bg-teal-50'}`}>
        <p className="text-xs font-semibold text-slate-600"><StateBadge value={item.isRead ? 'READ' : 'UNREAD'} /> · {item.type === 'INTERNAL_NOTE' ? 'Internal note' : labels[item.type] || 'Support update'}</p>
        <h2 className="mt-2 break-words font-semibold">{item.title}</h2>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{item.message}</p>
        <p className="mt-2 text-xs text-slate-500">{formatTicketDate(item.createdAt)}</p>
        <div className="mt-3 layout-actions">
          {item.ticketId != null && /^[1-9]\d*$/.test(String(item.ticketId)) && <button type="button" className={buttonClass} disabled={openingId !== null || markingAll || pendingIds.includes(String(item.id))} onClick={() => viewTicket(item)}>{openingId === String(item.id) ? 'Opening...' : 'View Ticket'}</button>}
          {!item.isRead && <button type="button" className={buttonClass} disabled={markingAll || pendingIds.includes(String(item.id))} onClick={() => markOne(item.id)}>{pendingIds.includes(String(item.id)) ? 'Marking as read...' : 'Mark as read'}</button>}
        </div>
      </li>)}</ul>}
      <Pagination metadata={current.data.pagination} noun="notifications" label="notifications" disabled={markingAll || pendingIds.length > 0 || Boolean(openingId)} onPageChange={page => setRequest(previous => ({ ...previous, page }))} />
    </>}
  </div>
}

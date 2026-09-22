import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import NotificationReadNotice from '../shared/NotificationReadNotice'
import { getTicketById, updateTicketStatus, updateTicketPriority, resolveTicket } from '../../api/ticketApi'
import TicketResolveControl from './TicketResolveControl'
import { canResolveTicket, validateResolutionSummary } from './ticketResolution'
import TicketPriorityControl from './TicketPriorityControl'
import { canManagePriority } from './ticketPriorityEligibility'
import TicketStatusActions from './TicketStatusActions'
import TicketSlaTimers from './TicketSlaTimers'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'
import TicketStatusTimeline from '../employee/TicketStatusTimeline'
import TicketConversation from '../employee/TicketConversation'
import TicketInternalNotes from './TicketInternalNotes'
import TicketAttachments from '../employee/TicketAttachments'
import { formatTicketDate, formatTicketPriority, formatTicketStatus } from '../employee/ticketFormatting'

const actionClass = 'inline-flex min-h-11 items-center rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50'
const panelClass = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6'
const personName = person => [person?.firstName, person?.lastName].filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).join(' ')

export default function TechnicianTicketDetailsPage() {
  const { ticketId } = useParams()
  const { user } = useAuth()
  return <><NotificationReadNotice /><TicketWorkspace key={`${user?.id}:${ticketId}`} ticketId={ticketId} userId={user?.id} /></>
}

function TicketWorkspace({ ticketId, userId }) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const [updating, setUpdating] = useState(false)
  const pending = useRef(false)
  const mounted = useRef(false)
  const [notice, setNotice] = useState(null)
  const [historyRevision, setHistoryRevision] = useState(0)
  const [replyDraft, setReplyDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [resolutionSummary, setResolutionSummary] = useState('')
  const [resolving, setResolving] = useState(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
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
  async function refreshAfterReply(accessChanged = false) {
    if (accessChanged) setNotice({ error: true, text: 'This ticket no longer accepts your reply. Your draft has been kept. Refreshing ticket details.' })
    try {
      const ticket = await getTicketById(ticketId)
      if (mounted.current) setResult({ attempt, ticket })
    } catch (error) {
      if (!mounted.current) return
      if ([403, 404].includes(error?.response?.status)) setResult({ attempt, unavailable: true, error: 'Ticket not found or you do not have access to it.' })
      else setNotice({ error: true, text: 'Unable to refresh ticket details. Use Refresh to try again.' })
    }
  }
  async function resolve() {
    if (pending.current || !current?.ticket || !canResolveTicket(current.ticket, userId)) return
    const validation = validateResolutionSummary(resolutionSummary)
    if (validation) { setNotice({ error: true, text: validation }); return }
    pending.current = true
    setUpdating(true); setResolving(true); setNotice(null)
    try {
      const ticket = await resolveTicket(ticketId, resolutionSummary)
      if (!mounted.current) return
      setResult({ attempt, ticket })
      setResolutionSummary('')
      setNotice({ text: 'Ticket resolved successfully.' })
      setHistoryRevision(value => value + 1)
      await refreshAfterReply()
    } catch (error) {
      if (!mounted.current) return
      const stale = [400, 403, 404, 409, 422].includes(error?.response?.status)
      setNotice({ error: true, text: getApiErrorMessage(error, stale ? 'This ticket could not be resolved. Check its current state and your resolution summary.' : 'Unable to resolve ticket. Please try again.') })
      if (stale) {
        setHistoryRevision(value => value + 1)
        await refreshAfterReply()
      }
    } finally {
      pending.current = false
      if (mounted.current) { setUpdating(false); setResolving(false) }
    }
  }
  async function changePriority(priorityId) {
    if (pending.current || !current?.ticket || !canManagePriority(current.ticket, userId) || String(current.ticket.priority?.id) === String(priorityId)) return
    pending.current = true
    setUpdating(true)
    setNotice(null)
    try {
      const ticket = await updateTicketPriority(ticketId, priorityId)
      if (!mounted.current) return
      setResult({ attempt, ticket })
      setNotice({ text: 'Priority updated successfully.' })
    } catch (error) {
      if (!mounted.current) return
      const message = error?.response?.data?.message
      const safeMessages = ['Selected ticket priority is inactive', 'Ticket priority not found', 'Ticket priority cannot be changed in its current status']
      setNotice({ error: true, text: error?.response?.status < 500 && safeMessages.includes(message)
        ? `${message}.` : getApiErrorMessage(error, 'Unable to update priority. Please try again.') })
    } finally {
      pending.current = false
      if (mounted.current) {
        setUpdating(false)
        // Re-read authorization, priority and server-recalculated SLA deadlines.
        setAttempt(value => value + 1)
      }
    }
  }
  async function changeStatus(status) {
    if (pending.current || !current?.ticket) return
    pending.current = true
    setUpdating(true)
    setNotice(null)
    try {
      const ticket = await updateTicketStatus(ticketId, status)
      if (!mounted.current) return
      setResult({ attempt, ticket })
      setHistoryRevision(value => value + 1)
      setNotice({ text: 'Ticket status updated successfully.' })
    } catch (error) {
      if (!mounted.current) return
      const code = error?.response?.status
      const stale = [400, 403, 404, 409, 422].includes(code)
      const message = error?.response?.data?.message
      const safeMessages = ['Ticket is already in the requested status', 'Ticket must be assigned before its status can be updated']
      setNotice({ error: true, text: code === 409
        ? `${safeMessages.includes(message) ? message : 'This status change is no longer available for the ticket'}. Refreshing ticket details.`
        : getApiErrorMessage(error, stale ? 'This ticket could not be updated. Refreshing ticket details.' : 'Unable to update ticket status. Please try again.') })
      if (stale) setAttempt(value => value + 1)
    } finally {
      pending.current = false
      if (mounted.current) setUpdating(false)
    }
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link to={unassigned ? '/technician/tickets/unassigned' : '/technician/tickets/assigned'} className={actionClass}>{unassigned ? 'Back to Unassigned Queue' : 'Back to My Assigned Tickets'}</Link>
      {current?.ticket && <button type="button" disabled={updating} className={actionClass} onClick={() => setAttempt(value => value + 1)}>Refresh</button>}
    </div>
    {notice && <AuthFeedback variant={notice.error ? 'error' : 'success'}>{notice.text}</AuthFeedback>}
    {!current && <p role="status">Loading ticket...</p>}
    {current?.error && <section className="space-y-3">
      <h1 className="text-2xl font-semibold">{current.unavailable ? 'Ticket unavailable' : 'Unable to load ticket'}</h1>
      <AuthFeedback>{current.error}</AuthFeedback>
      {!current.unavailable && <button type="button" className={actionClass} onClick={() => setAttempt(value => value + 1)}>Retry</button>}
    </section>}
    {current?.ticket && <>
      <TechnicianTicketDetailsContent ticket={current.ticket} userId={userId} />
      <TicketSlaTimers ticket={current.ticket} />
      <TicketStatusActions ticket={current.ticket} userId={userId} pending={updating} onUpdate={changeStatus} />
      <TicketResolveControl ticket={current.ticket} userId={userId} summary={resolutionSummary} onSummaryChange={setResolutionSummary} pending={updating} resolving={resolving} onResolve={resolve} />
      <TicketPriorityControl ticket={current.ticket} userId={userId} pending={updating} onUpdate={changePriority} />
      <TicketStatusTimeline key={`${ticketId}:${attempt}:${historyRevision}`} ticketId={ticketId} title="Status History" />
      <TicketConversation ticketId={ticketId} status={current.ticket.status} assignedTo={current.ticket.assignedTo} disabled={updating} draft={replyDraft} onDraftChange={setReplyDraft} onSendingChange={value => { pending.current = value; setUpdating(value) }} onPosted={() => refreshAfterReply()} onAccessChanged={() => refreshAfterReply(true)} />
      <TicketInternalNotes ticket={current.ticket} userId={userId} disabled={updating} draft={noteDraft} onDraftChange={setNoteDraft} onPendingChange={value => { if (mounted.current) { pending.current = value; setUpdating(value) } }} onAccessChanged={() => {
        setNotice({ error: true, text: 'This ticket no longer accepts your internal note. Your draft has been kept.' })
        return refreshAfterReply()
      }} />
      <TicketAttachments ticketId={ticketId} status={current.ticket.status}
        canUpload={userId != null && current.ticket.assignedTo != null && String(current.ticket.assignedTo) === String(userId)}
        disabled={updating}
        onUploadingChange={value => { if (mounted.current) { pending.current = value; setUpdating(value) } }}
        onAccessChanged={() => refreshAfterReply()} />
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
    ...(ticket.resolvedAt ? [['Resolved', formatTicketDate(ticket.resolvedAt)]] : []),
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
        {ticket.resolutionSummary && <div className="mt-6"><h3 className="font-semibold">Resolution summary</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{ticket.resolutionSummary}</p></div>}
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

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { getTicketComments, addTicketComment } from '../../api/ticketApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'
import { formatTicketDate } from './ticketFormatting'

export default function TicketConversation({ ticketId, status, assignedTo, disabled = false, draft, onDraftChange, onPosted, onAccessChanged, onSendingChange }) {
  const { user } = useAuth()
  const [conversation, setConversation] = useState({ loading: true, comments: [], error: false })
  const [attempt, setAttempt] = useState(0)
  const [localContent, setLocalContent] = useState('')
  const content = draft ?? localContent
  const setContent = onDraftChange ?? setLocalContent
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const pending = useRef(false)
  const active = useRef(true)
  const canReply = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED'].includes(status) && (user?.role !== 'TECHNICIAN' || (assignedTo != null && user?.id != null && String(assignedTo) === String(user.id)))
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    getTicketComments(ticketId, { signal: controller.signal }).then(comments => {
      if (!controller.signal.aborted) setConversation({ loading: false, comments, error: false })
    }).catch(() => {
      if (!controller.signal.aborted) setConversation({ loading: false, comments: [], error: true })
    })
    return () => controller.abort()
  }, [ticketId, attempt])

  async function submit(event) {
    event.preventDefault()
    if (pending.current || disabled || !canReply) return
    const length = Array.from(content.trim()).length
    if (length < 1 || length > 5000) { setError('Enter a reply between 1 and 5,000 characters.'); return }
    pending.current = true
    setSending(true)
    onSendingChange?.(true)
    setError(null)
    setSent(false)
    try {
      await addTicketComment(ticketId, { content })
      if (!active.current) return
      setContent('')
      setSent(true)
      // Refetch only: do not append and then duplicate the returned record.
      setConversation(previous => ({ ...previous, loading: true, error: false }))
      setAttempt(value => value + 1)
      await onPosted?.()
    } catch (cause) {
      if (active.current) setError(cause?.response?.status === 409 ? 'This ticket no longer accepts replies. Reload the ticket to check its status.' :
        [403, 404].includes(cause?.response?.status) ? 'This conversation is not available.' :
        cause?.response?.status === 422 ? 'Please check your reply. It must be between 1 and 5,000 characters.' :
        getApiErrorMessage(cause, 'Unable to send your reply. Please try again.'))
      if (active.current && [403, 404, 409].includes(cause?.response?.status)) {
        setConversation(previous => ({ ...previous, loading: true, error: false }))
        setAttempt(value => value + 1)
        await onAccessChanged?.()
      }
    } finally {
      pending.current = false
      if (active.current) { setSending(false); onSendingChange?.(false) }
    }
  }
  return <section aria-labelledby="conversation-heading" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 lg:p-8">
    <h2 id="conversation-heading" className="text-lg font-semibold">Conversation</h2>
    {conversation.loading ? <p role="status" className="mt-4 text-sm text-slate-600">Loading conversation...</p> : conversation.error ? <div className="mt-4">
      <AuthFeedback>Unable to load conversation.</AuthFeedback>
      <button type="button" className="mt-3 rounded text-sm font-semibold text-teal-800 underline focus-visible:outline-2" onClick={() => { setConversation(previous => ({ ...previous, loading: true, error: false })); setAttempt(value => value + 1) }}>Retry conversation</button>
    </div> : <PublicCommentList comments={conversation.comments} userId={user?.id} />}
    {canReply ? <form onSubmit={submit} noValidate className="mt-6 space-y-3">
      <label htmlFor="public-reply" className="block text-sm font-semibold">Add a reply</label>
      <textarea id="public-reply" value={content} onChange={event => { setContent(event.target.value); setError(null); setSent(false) }} required maxLength={5000} rows={4} placeholder="Write a public reply..." disabled={sending || disabled} aria-describedby="reply-feedback" aria-invalid={Boolean(error)} className="block w-full min-w-0 resize-y rounded-lg border border-slate-300 p-3 text-sm focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-60" />
      <div id="reply-feedback">{error && <AuthFeedback>{error}</AuthFeedback>}</div>
      <button type="submit" disabled={sending} className="cursor-pointer disabled:cursor-not-allowed rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">{sending ? 'Sending...' : 'Send Reply'}</button>
      <p role="status" className="text-sm text-teal-800">{sent ? 'Reply sent.' : sending ? 'Sending reply...' : ''}</p>
    </form> : <p className="mt-6 text-sm text-slate-600">This ticket is {status === 'CLOSED' ? 'closed' : status === 'RESOLVED' ? 'resolved' : 'not available for you to reply to'}. Public replies are unavailable.</p>}
  </section>
}

export function PublicCommentList({ comments, userId }) {
  const visible = comments.filter(comment => comment?.commentType === 'PUBLIC')
  if (!visible.length) return <p className="mt-4 text-sm text-slate-600">No public replies yet.</p>
  return <ol className="mt-4 space-y-4">
    {visible.map(comment => {
      const name = [comment.author?.firstName, comment.author?.lastName].filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).join(' ')
      const role = { EMPLOYEE: 'Employee', TECHNICIAN: 'Technician', ADMIN: 'Admin' }[comment.author?.role]
      const own = userId != null && String(comment.author?.id) === String(userId)
      return <li key={comment.id} className="min-w-0 rounded-xl bg-slate-50 p-4">
        <p className="break-words text-sm font-semibold">{own ? 'You' : name || 'Support participant'}{role ? ` (${role})` : ''}</p>
        <p className="mt-1 text-xs text-slate-500">{formatTicketDate(comment.createdAt)}</p>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{comment.content}</p>
      </li>
    })}
  </ol>
}

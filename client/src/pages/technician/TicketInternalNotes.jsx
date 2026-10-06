import ErrorState from '../../components/ErrorState'
import EmptyState from '../../components/EmptyState'
import ContentSkeleton from '../../components/ContentSkeleton'
import { useEffect, useRef, useState } from 'react'
import { getTicketInternalNotes, addTicketInternalNote } from '../../api/ticketApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'
import { formatTicketDate } from '../employee/ticketFormatting'

export default function TicketInternalNotes({ ticket, userId, disabled, draft, onDraftChange, onPendingChange, onAccessChanged }) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const pending = useRef(false)
  const active = useRef(false)
  const canAdd = userId != null && ticket.assignedTo != null && String(ticket.assignedTo) === String(userId) && ticket.status !== 'CLOSED'
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    getTicketInternalNotes(ticket.id, { signal: controller.signal }).then(notes => {
      if (!controller.signal.aborted) setResult({ attempt, notes })
    }).catch(() => { if (!controller.signal.aborted) setResult({ attempt, error: true }) })
    return () => controller.abort()
  }, [ticket.id, attempt])
  const current = result?.attempt === attempt ? result : null
  async function submit(event) {
    event.preventDefault()
    if (pending.current || disabled || !canAdd) return
    const length = Array.from(draft.trim()).length
    if (length < 1 || length > 5000) { setError(length === 0 ? 'Internal note is required.' : 'Internal note must not exceed 5,000 characters.'); document.getElementById('internal-note')?.focus(); return }
    pending.current = true; setAdding(true); onPendingChange(true); setError(null); setAdded(false)
    try {
      await addTicketInternalNote(ticket.id, { content: draft })
      if (!active.current) return
      onDraftChange(''); setAdded(true); setAttempt(value => value + 1)
    } catch (cause) {
      if (!active.current) return
      const stale = [403, 404, 409].includes(cause?.response?.status)
      setError(stale ? 'This ticket no longer accepts your internal note. Your draft has been kept.' :
        [400, 422].includes(cause?.response?.status) ? 'Please check your note. It must be between 1 and 5,000 characters.' :
          getApiErrorMessage(cause, 'Unable to add your note. Please try again.'))
      if (stale) { setAttempt(value => value + 1); await onAccessChanged() }
    } finally {
      pending.current = false
      onPendingChange(false)
      if (active.current) setAdding(false)
    }
  }
  return <section aria-labelledby="internal-notes-heading" className="min-w-0 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4 sm:p-6">
    <h2 id="internal-notes-heading" className="text-lg font-semibold">Internal Notes</h2>
    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Visible only to support staff.</p>
    {!current ? <ContentSkeleton initial={!result && attempt === 0} variant="rows">Loading internal notes...</ContentSkeleton> : current.error ? <ErrorState compact className="mt-4" title="Unable to load internal notes."><button type="button" onClick={() => setAttempt(value => value + 1)} className="cursor-pointer rounded text-teal-800 dark:text-teal-300 underline focus-visible:outline-2">Retry</button></ErrorState> : <InternalNoteList notes={current.notes} userId={userId} />}
    <div id="internal-note-feedback" className="mt-3">{error && <AuthFeedback>{error}</AuthFeedback>}</div>
    {added && <AuthFeedback variant="success">Internal note added.</AuthFeedback>}
    {canAdd && <form onSubmit={submit} noValidate className="mt-4 space-y-3">
      <label htmlFor="internal-note" className="block text-sm font-semibold">Add an internal note <span aria-hidden="true">*</span></label>
      <textarea id="internal-note" placeholder="Add an internal note..." value={draft} onChange={event => { onDraftChange(event.target.value); setError(null); setAdded(false) }} rows={4} maxLength={5000} required disabled={adding || disabled} aria-describedby="internal-note-feedback" aria-invalid={Boolean(error)} className="block w-full min-w-0 resize-y rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-base focus-visible:outline-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400 disabled:opacity-60 sm:text-sm" />
      <button type="submit" disabled={adding || disabled} className="cursor-pointer rounded-lg border border-teal-700 dark:border-teal-400 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50">{adding ? 'Sending...' : 'Add Note'}</button>
    </form>}
  </section>
}

export function InternalNoteList({ notes, userId }) {
  const visible = notes.filter(note => note?.commentType === 'INTERNAL')
  if (!visible.length) return <EmptyState compact title="No internal notes yet." />
  return <ol className="mt-4 space-y-4">{visible.map(note => {
    const name = [note.author?.firstName, note.author?.lastName].filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).join(' ')
    const role = { TECHNICIAN: 'Technician', ADMIN: 'Admin' }[note.author?.role]
    return <li key={note.id} className="min-w-0 rounded-xl bg-white dark:bg-slate-900 p-4">
      <article aria-labelledby={`note-author-${note.id}`}><p id={`note-author-${note.id}`} className="text-sm font-semibold">Internal note by {userId != null && String(note.author?.id) === String(userId) ? 'You' : name || 'Support staff'}{role ? ` (${role})` : ''}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400"><time dateTime={note.createdAt}>{formatTicketDate(note.createdAt)}</time></p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{note.content}</p></article>
    </li>
  })}</ol>
}

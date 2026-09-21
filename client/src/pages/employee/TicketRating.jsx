import { useRef, useState } from 'react'
import { saveTicketFeedback } from '../../api/ticketApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'

export default function TicketRating({ ticketId, onConflict }) {
  const [rating, setRating] = useState('')
  const [comment, setComment] = useState('')
  const [saved, setSaved] = useState(null)
  const [editing, setEditing] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const pending = useRef(false)
  async function submit(event) {
    event.preventDefault()
    if (pending.current) return
    const number = Number(rating)
    if (!Number.isInteger(number) || number < 1 || number > 5) { setError('Select a rating from 1 to 5.'); return }
    if (Array.from(comment.trim()).length > 1000) { setError('Feedback must be at most 1,000 characters.'); return }
    pending.current = true
    setSubmitting(true)
    setError(null)
    try {
      const feedback = await saveTicketFeedback(ticketId, { rating: number, comment })
      setSaved(feedback)
      setRating(String(feedback.rating))
      setComment(feedback.comment || '')
      setEditing(false)
    } catch (cause) {
      if (cause?.response?.status === 409) { onConflict(); return }
      setError([403, 404].includes(cause?.response?.status) ? 'Feedback is not available for this ticket.' : cause?.response?.status === 422 ? 'Choose a rating from 1 to 5 and keep feedback within 1,000 characters.' : getApiErrorMessage(cause, 'Unable to save your rating. Please try again.'))
    } finally { pending.current = false; setSubmitting(false) }
  }
  return <section aria-labelledby="rating-heading" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 lg:p-8">
    <h2 id="rating-heading" className="text-lg font-semibold">Rate Support</h2>
    {!editing && saved ? <div className="mt-4 space-y-3">
      <AuthFeedback variant="success">Your support rating was saved.</AuthFeedback>
      <p className="font-semibold">{saved.rating} out of 5</p>
      {saved.comment && <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{saved.comment}</p>}
      <button type="button" onClick={() => setEditing(true)} className="rounded text-sm font-semibold text-teal-800 underline focus-visible:outline-2">Update rating</button>
    </div> : <form onSubmit={submit} noValidate className="mt-4 space-y-4">
      <p className="text-sm text-slate-600">Rate your support experience. Saving replaces any previous rating and feedback for this ticket.</p>
      {!saved && <p className="text-xs text-slate-500">Previously saved feedback cannot currently be loaded here.</p>}
      {error && <AuthFeedback>{error}</AuthFeedback>}
      <fieldset disabled={submitting} aria-describedby="rating-scale" className="space-y-3">
        <legend className="text-sm font-semibold">Support rating (required)</legend>
        <p id="rating-scale" className="text-xs text-slate-500">1 is lowest; 5 is highest.</p>
        <div className="flex flex-wrap gap-4">{[1, 2, 3, 4, 5].map(value => <label key={value} className="flex items-center gap-2 rounded-lg border border-slate-300 p-3 text-sm"><input type="radio" name="support-rating" value={value} checked={rating === String(value)} onChange={event => { setRating(event.target.value); setError(null) }} aria-label={`${value} out of 5`} required />{value}</label>)}</div>
        <label htmlFor="support-feedback" className="block text-sm font-semibold">Additional feedback (optional)</label>
        <textarea id="support-feedback" value={comment} onChange={event => setComment(event.target.value)} maxLength={1000} rows={4} className="block w-full min-w-0 resize-y rounded-lg border border-slate-300 p-3 text-sm focus-visible:outline-2 focus-visible:outline-teal-700" />
        <p className="text-xs text-slate-500">Maximum 1,000 characters.</p>
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={submitting} className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{submitting ? 'Submitting...' : saved ? 'Update Rating' : 'Submit Rating'}</button>
        {saved && <button type="button" disabled={submitting} onClick={() => { setRating(String(saved.rating)); setComment(saved.comment || ''); setError(null); setEditing(false) }} className="rounded px-3 py-2 text-sm underline focus-visible:outline-2">Cancel</button>}
      </div>
      <p role="status" className="sr-only">{submitting ? 'Submitting rating...' : ''}</p>
    </form>}
  </section>
}

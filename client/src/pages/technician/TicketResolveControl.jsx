import { useState } from 'react'
import AuthFeedback from '../../auth/AuthFeedback'

import { canResolveTicket, validateResolutionSummary } from './ticketResolution'

const buttonClass = 'min-h-11 cursor-pointer rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

export default function TicketResolveControl({ ticket, userId, summary, onSummaryChange, pending, resolving, onResolve }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState(null)
  if (!canResolveTicket(ticket, userId)) return null
  function submit(event) {
    event.preventDefault()
    if (pending || resolving) return
    const validation = validateResolutionSummary(summary)
    setError(validation)
    if (!validation) setConfirming(true)
  }
  return <section aria-labelledby="resolve-heading" className="min-w-0 rounded-2xl border border-teal-200 bg-white p-4 sm:p-6">
    <h2 id="resolve-heading" className="text-lg font-semibold">Resolve Ticket</h2>
    <form onSubmit={submit} noValidate className="mt-3 space-y-3">
      <label htmlFor="resolution-summary" className="block text-sm font-semibold">Resolution note *</label>
      <p id="resolution-help" className="text-sm text-slate-600">Describe how the issue was resolved before resolving the ticket. Required: 10–5,000 characters.</p>
      <textarea id="resolution-summary" rows={4} value={summary} disabled={pending} required aria-describedby="resolution-help resolution-error" aria-invalid={Boolean(error)} onChange={event => { onSummaryChange(event.target.value); setConfirming(false); setError(null) }} className="block w-full min-w-0 resize-y rounded-lg border border-slate-300 p-3 focus-visible:outline-2 disabled:opacity-60" />
      <div id="resolution-error">{error && <AuthFeedback>{error}</AuthFeedback>}</div>
      {confirming ? <div className="space-y-3">
        <p className="text-sm font-semibold">Resolve this ticket?</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={pending} className={buttonClass} onClick={() => setConfirming(false)}>Cancel</button>
          <button type="button" disabled={pending || resolving || !summary.trim()} className={buttonClass} onClick={onResolve}>{resolving ? 'Resolving...' : 'Confirm Resolve'}</button>
        </div>
      </div> : <button type="submit" disabled={pending || resolving || !summary.trim()} className={buttonClass}>Resolve Ticket</button>}
    </form>
  </section>
}

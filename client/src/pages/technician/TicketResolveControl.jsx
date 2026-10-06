import { useState } from 'react'
import AuthFeedback from '../../auth/AuthFeedback'

import { canResolveTicket, validateResolutionSummary } from './ticketResolution'

const buttonClass = 'min-h-11 cursor-pointer rounded-lg border border-teal-700 dark:border-teal-400 px-4 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

export default function TicketResolveControl({ ticket, userId, summary, onSummaryChange, pending, resolving, onResolve }) {
  const [error, setError] = useState(null)
  if (!canResolveTicket(ticket, userId)) return null
  function submit(event) {
    event.preventDefault()
    if (pending || resolving) return
    const validation = validateResolutionSummary(summary)
    setError(validation)
    if (validation) document.getElementById('resolution-summary')?.focus()
    else onResolve()
  }
  return <section aria-labelledby="resolve-heading" className="min-w-0 rounded-2xl border border-teal-200 dark:border-teal-800 bg-white dark:bg-slate-900 p-4 sm:p-6">
    <h2 id="resolve-heading" className="text-lg font-semibold">Resolve Ticket</h2>
    <form onSubmit={submit} noValidate className="mt-3 space-y-3">
      <label htmlFor="resolution-summary" className="block text-sm font-semibold">Resolution note <span aria-hidden="true">*</span></label>
      <p id="resolution-help" className="text-sm text-slate-600 dark:text-slate-300">Describe how the issue was resolved before resolving the ticket. Required: 10–5,000 characters.</p>
      <textarea id="resolution-summary" rows={4} value={summary} disabled={pending} required aria-describedby="resolution-help resolution-error" aria-invalid={Boolean(error)} onChange={event => { onSummaryChange(event.target.value); setError(null) }} className="block w-full min-w-0 resize-y rounded-lg border border-slate-300 dark:border-slate-700 p-3 focus-visible:outline-2 disabled:opacity-60" />
      <div id="resolution-error">{error && <AuthFeedback>{error}</AuthFeedback>}</div>
      <button type="submit" disabled={pending || resolving || !summary.trim()} className={buttonClass}>{resolving ? 'Resolving...' : 'Resolve Ticket'}</button>
    </form>
  </section>
}

import { useEffect, useState } from 'react'
import { getTicketStatusHistory } from '../../api/ticketApi'
import { formatTicketDate, formatTicketStatus } from './ticketFormatting'

export default function TicketStatusTimeline({ ticketId }) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    getTicketStatusHistory(ticketId, { signal: controller.signal }).then(history => {
      if (!controller.signal.aborted) setResult({ ticketId, attempt, history, failed: false })
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ ticketId, attempt, history: [], failed: true })
    })
    return () => controller.abort()
  }, [ticketId, attempt])
  const current = result?.ticketId === ticketId && result?.attempt === attempt ? result : null
  return <section aria-labelledby="status-history-heading" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
    <h2 id="status-history-heading" className="text-lg font-semibold">Status timeline</h2>
    {!current && <p role="status" className="mt-4 text-sm text-slate-600">Loading status history...</p>}
    {current?.failed && <div className="mt-4">
      <p role="alert" className="text-sm text-slate-600">Unable to load status history.</p>
      <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-3 rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2">Retry status history</button>
    </div>}
    {current && !current.failed && <StatusHistoryList history={current.history} />}
  </section>
}

export function StatusHistoryList({ history }) {
  if (!history.length) return <p className="mt-4 text-sm text-slate-600">No status history is available yet.</p>
  // The endpoint orders records by changed_at ASC, id ASC; preserve that order.
  return <ol className="mt-5 space-y-5 border-l-2 border-teal-100 pl-4 sm:pl-6">
    {history.map(entry => {
      const name = [entry.changedBy?.firstName, entry.changedBy?.lastName]
        .filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).join(' ')
      return <li key={entry.id} className="min-w-0">
        <p className="break-words text-sm font-semibold text-slate-900">{entry.fromStatus ? `${formatTicketStatus(entry.fromStatus)} → ${formatTicketStatus(entry.toStatus)}` : `Moved to ${formatTicketStatus(entry.toStatus)}`}</p>
        <p className="mt-1 break-words text-sm text-slate-600">{name ? `Changed by ${name}` : 'Changed by a support team member or requester'}</p>
        <p className="mt-1 text-xs text-slate-500">{formatTicketDate(entry.changedAt)}</p>
      </li>
    })}
  </ol>
}

import { useRef, useState } from 'react'
import { reopenTicket } from '../../api/ticketApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'

export default function ReopenTicketButton({ ticketId, onReopened, onConflict, disabled = false, onPendingChange }) {
  const [reopening, setReopening] = useState(false)
  const [error, setError] = useState(null)
  const pending = useRef(false)
  async function handleReopen() {
    if (pending.current || disabled) return
    if (!window.confirm('Reopen this ticket? The support team will continue working on this issue.')) return
    pending.current = true; onPendingChange?.(true)
    setReopening(true)
    setError(null)
    try { onReopened(await reopenTicket(ticketId)) }
    catch (cause) {
      if (cause?.response?.status === 409) {
        onConflict()
        return
      }
      setError([403, 404].includes(cause?.response?.status) ? 'This ticket is not available to reopen.' : getApiErrorMessage(cause, 'Unable to reopen this ticket. Please try again.'))
    } finally { pending.current = false; onPendingChange?.(false); setReopening(false) }
  }
  return <div className="space-y-3">
    <button type="button" disabled={reopening || disabled} onClick={handleReopen} className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{reopening ? 'Reopening...' : 'Reopen Ticket'}</button>
    <p role="status" className="sr-only">{reopening ? 'Reopening ticket...' : ''}</p>
    {error && <AuthFeedback>{error}</AuthFeedback>}
  </div>
}

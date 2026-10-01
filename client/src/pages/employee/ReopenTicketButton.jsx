import ConfirmDialog from '../../components/ConfirmDialog'
import { useRef, useState } from 'react'
import { reopenTicket } from '../../api/ticketApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'

export default function ReopenTicketButton({ ticketId, onReopened, onConflict, disabled = false, onPendingChange }) {
  const [confirming, setConfirming] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [error, setError] = useState(null)
  const pending = useRef(false)
  async function handleReopen() {
    if (pending.current || disabled) return
    pending.current = true; onPendingChange?.(true)
    setReopening(true)
    setError(null)
    try { const ticket = await reopenTicket(ticketId); setConfirming(false); onReopened(ticket) }
    catch (cause) {
      if (cause?.response?.status === 409) {
        setConfirming(false)
        onConflict()
        return
      }
      setError([403, 404].includes(cause?.response?.status) ? 'This ticket is not available to reopen.' : getApiErrorMessage(cause, 'Unable to reopen this ticket. Please try again.'))
    } finally { pending.current = false; onPendingChange?.(false); setReopening(false) }
  }
  return <div className="space-y-3">
    <button type="button" disabled={reopening || disabled} onClick={() => { setError(null); setConfirming(true) }} className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">{reopening ? 'Reopening...' : 'Reopen Ticket'}</button>
    <p role="status" className="sr-only">{reopening ? 'Reopening ticket...' : ''}</p>
    <ConfirmDialog open={confirming} title="Reopen Ticket?" description="The support team will continue working on this issue." confirmLabel="Reopen Ticket" pending={reopening} pendingLabel="Reopening..." onConfirm={handleReopen} onCancel={() => setConfirming(false)}>{error && <AuthFeedback>{error}</AuthFeedback>}</ConfirmDialog>
    {!confirming && error && <AuthFeedback>{error}</AuthFeedback>}
  </div>
}

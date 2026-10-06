import ConfirmDialog from '../../components/ConfirmDialog'
import { useRef, useState } from 'react'
import { closeTicket } from '../../api/ticketApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'

export default function CloseTicketButton({ ticketId, onClosed, onConflict, disabled = false, onPendingChange }) {
  const [confirming, setConfirming] = useState(false)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState(null)
  const pending = useRef(false)
  async function handleClose() {
    if (pending.current || disabled) return
    pending.current = true; onPendingChange?.(true)
    setClosing(true)
    setError(null)
    try { const ticket = await closeTicket(ticketId); setConfirming(false); onClosed(ticket) }
    catch (cause) {
      if (cause?.response?.status === 409) {
        setConfirming(false)
        onConflict()
        return
      }
      setError([403, 404].includes(cause?.response?.status) ? 'This ticket is not available to close.' : getApiErrorMessage(cause, 'Unable to close this ticket. Please try again.'))
    } finally { pending.current = false; onPendingChange?.(false); setClosing(false) }
  }
  return <div className="space-y-3">
    <button type="button" disabled={closing || disabled} onClick={() => { setError(null); setConfirming(true) }} className="rounded-lg border border-teal-700 dark:border-teal-400 px-4 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">{closing ? 'Closing...' : 'Close Ticket'}</button>
    <p role="status" className="sr-only">{closing ? 'Closing ticket...' : ''}</p>
    <ConfirmDialog open={confirming} title="Close Ticket?" description="This will mark your support request as closed." confirmLabel="Close Ticket" pending={closing} pendingLabel="Closing..." onConfirm={handleClose} onCancel={() => setConfirming(false)}>{error && <AuthFeedback>{error}</AuthFeedback>}</ConfirmDialog>
    {!confirming && error && <AuthFeedback>{error}</AuthFeedback>}
  </div>
}

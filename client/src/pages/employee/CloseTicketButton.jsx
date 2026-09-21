import { useRef, useState } from 'react'
import { closeTicket } from '../../api/ticketApi'
import { getApiErrorMessage } from '../../api/apiError'
import AuthFeedback from '../../auth/AuthFeedback'

export default function CloseTicketButton({ ticketId, onClosed, onConflict }) {
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState(null)
  const pending = useRef(false)
  async function handleClose() {
    if (pending.current) return
    if (!window.confirm('Close this resolved ticket? This will mark your support request as closed.')) return
    pending.current = true
    setClosing(true)
    setError(null)
    try { onClosed(await closeTicket(ticketId)) }
    catch (cause) {
      if (cause?.response?.status === 409) {
        onConflict()
        return
      }
      setError([403, 404].includes(cause?.response?.status) ? 'This ticket is not available to close.' : getApiErrorMessage(cause, 'Unable to close this ticket. Please try again.'))
    } finally { pending.current = false; setClosing(false) }
  }
  return <div className="space-y-3">
    <button type="button" disabled={closing} onClick={handleClose} className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{closing ? 'Closing...' : 'Close Ticket'}</button>
    <p role="status" className="sr-only">{closing ? 'Closing ticket...' : ''}</p>
    {error && <AuthFeedback>{error}</AuthFeedback>}
  </div>
}

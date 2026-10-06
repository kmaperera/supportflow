import ConfirmDialog from '../components/ConfirmDialog'
import { useToast } from '../components/toastContext'
import AuthFeedback from './AuthFeedback'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'
import LogoutButton from './LogoutButton'

export default function SessionActions() {
  const [confirming, setConfirming] = useState(false)
  const toast = useToast()
  const { logoutAllUserSessions, isLoggingOut, isLoggingOutAll } = useAuth()
  const [error, setError] = useState(null)
  const pending = useRef(false)
  const navigate = useNavigate()

  async function handleLogoutAll() {
    if (pending.current || isLoggingOut || isLoggingOutAll) return
    pending.current = true
    setError(null)
    try {
      await logoutAllUserSessions()
      setConfirming(false)
      toast.success('Logged out of all sessions.')
      navigate('/login', { replace: true })
    } catch {
      setError('Unable to log out all sessions. Please try again.')
    } finally {
      pending.current = false
    }
  }

  return <div aria-busy={isLoggingOutAll || isLoggingOut}>
    <p role="status" aria-live="polite" className="sr-only">{isLoggingOutAll ? 'Logging out all sessions...' : ''}</p>
    <LogoutButton disabled={isLoggingOutAll} />
    <button type="button" onClick={() => { setError(null); setConfirming(true) }} disabled={isLoggingOut || isLoggingOutAll} className="mt-4 ml-3 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400 disabled:opacity-60 disabled:cursor-not-allowed">{isLoggingOutAll ? 'Logging out all sessions...' : 'Log out all sessions'}</button>
    <ConfirmDialog open={confirming} title="Log out of all sessions?" description="You will need to sign in again on this device and your other devices/sessions." confirmLabel="Log Out All Sessions" variant="warning" pending={isLoggingOutAll} pendingLabel="Logging out..." onConfirm={handleLogoutAll} onCancel={() => setConfirming(false)}>{error && <AuthFeedback>{error}</AuthFeedback>}</ConfirmDialog>
  </div>
}

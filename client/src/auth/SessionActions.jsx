import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'
import LogoutButton from './LogoutButton'

export default function SessionActions() {
  const { logoutAllUserSessions, isLoggingOut, isLoggingOutAll } = useAuth()
  const [error, setError] = useState(null)
  const pending = useRef(false)
  const navigate = useNavigate()

  async function handleLogoutAll() {
    if (pending.current || isLoggingOut || isLoggingOutAll) return
    if (!window.confirm('This will sign you out from all devices and sessions. Continue?')) return
    pending.current = true
    setError(null)
    try {
      await logoutAllUserSessions()
      navigate('/login', { replace: true })
    } catch {
      setError('Unable to log out all sessions. Please try again.')
    } finally {
      pending.current = false
    }
  }

  return <div>
    <LogoutButton disabled={isLoggingOutAll} />
    <button type="button" onClick={handleLogoutAll} disabled={isLoggingOut || isLoggingOutAll} className="mt-4 ml-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60">{isLoggingOutAll ? 'Logging out all sessions...' : 'Log out all sessions'}</button>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </div>
}

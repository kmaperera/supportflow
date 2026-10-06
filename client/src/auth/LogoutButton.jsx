import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'

export default function LogoutButton({ disabled = false }) {
  const { logoutUser, isLoggingOut } = useAuth()
  const navigate = useNavigate()
  function handleLogout() {
    if (isLoggingOut) return
    void logoutUser()
    navigate('/login', { replace: true })
  }
  return <button type="button" onClick={handleLogout} disabled={disabled || isLoggingOut} className="mt-4 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400 disabled:opacity-60 disabled:cursor-not-allowed">{isLoggingOut ? 'Logging out...' : 'Logout'}</button>
}

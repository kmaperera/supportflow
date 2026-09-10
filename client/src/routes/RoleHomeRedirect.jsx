import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getRoleHome } from '../auth/roleHome'
import SessionLoading from './SessionLoading'

export default function RoleHomeRedirect() {
  const { isInitializing, isAuthenticated, user } = useAuth()
  if (isInitializing) return <SessionLoading />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  const home = getRoleHome(user?.role)
  if (!home) return <main className="p-8"><h1 className="text-2xl font-semibold">Access unavailable</h1><p className="mt-3 text-slate-600">Contact your SupportFlow administrator for access.</p></main>
  return <Navigate to={user.mustChangePassword === true ? '/change-password' : home} replace />
}

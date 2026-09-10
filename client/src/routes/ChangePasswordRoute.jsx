import { Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getRoleHome } from '../auth/roleHome'
import RoleHomeRedirect from './RoleHomeRedirect'

// Nested inside ProtectedRoute; only the forced-change state may see this page.
export default function ChangePasswordRoute() {
  const { user, isInitializing, isAuthenticated } = useAuth()
  if (isInitializing || !isAuthenticated || !getRoleHome(user?.role) || user.mustChangePassword !== true) {
    return <RoleHomeRedirect />
  }
  return <Outlet />
}

import { Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getRoleHome } from '../auth/roleHome'
import RoleHomeRedirect from './RoleHomeRedirect'

function RoleRoute({ role }) {
  const { user, isInitializing, isAuthenticated } = useAuth()
  if (isInitializing || !isAuthenticated || !getRoleHome(role) || user?.role !== role || user?.mustChangePassword === true) return <RoleHomeRedirect />
  return <Outlet />
}
export default RoleRoute

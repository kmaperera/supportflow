import { Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import RoleHomeRedirect from './RoleHomeRedirect'
import SessionLoading from './SessionLoading'

export default function LoginRoute() {
  const { isInitializing, isAuthenticated } = useAuth()
  if (isInitializing) return <SessionLoading />
  return isAuthenticated ? <RoleHomeRedirect /> : <Outlet />
}

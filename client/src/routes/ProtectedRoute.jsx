import { Navigate, Outlet, useLocation } from 'react-router-dom'
import SessionLoading from './SessionLoading'
import { useAuth } from '../auth/useAuth'

function ProtectedRoute() {
  const { isInitializing, isAuthenticated } = useAuth()
  const location = useLocation()

  if (isInitializing) {
    return <SessionLoading />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}

export default ProtectedRoute

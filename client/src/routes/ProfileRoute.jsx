import { useAuth } from '../auth/useAuth'
import RoleRoute from './RoleRoute'

export default function ProfileRoute() {
  const { user } = useAuth()
  // Reuse the known-role and forced-password checks for every supported role.
  return <RoleRoute role={user?.role} />
}

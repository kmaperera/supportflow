import WorkspaceShell from './WorkspaceShell'
import { matchPath, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { technicianNavigation } from './technicianNavigation'

export default function TechnicianLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const currentPage = technicianNavigation.find(item => matchPath({ path: item.path, end: true }, location.pathname))
  const name = [user?.firstName, user?.lastName]
    .filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).join(' ')
  const displayName = name || (typeof user?.email === 'string' && user.email.trim()) || 'Technician'

  return <WorkspaceShell role="Technician" title={currentPage?.title || 'Technician workspace'} displayName={displayName} navigation={technicianNavigation} />
}

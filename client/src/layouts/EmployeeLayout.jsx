import WorkspaceShell from './WorkspaceShell'
import { matchPath, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { employeeNavigation } from './employeeNavigation'

export default function EmployeeLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const currentPage = employeeNavigation.find(item => matchPath({ path: item.path, end: item.end !== false }, location.pathname))
  const name = [user?.firstName, user?.lastName]
    .filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim()).join(' ')
  const displayName = name || (typeof user?.email === 'string' && user.email.trim()) || 'Employee'

  return <WorkspaceShell role="Employee" title={currentPage?.title || 'Employee workspace'} displayName={displayName} navigation={employeeNavigation} />
}

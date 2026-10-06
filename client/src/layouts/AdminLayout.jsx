import WorkspaceShell from './WorkspaceShell'
import { matchPath, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { adminNavigation } from './adminNavigation'

export default function AdminLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const page = location.pathname.startsWith('/admin/knowledge-base/') ? { title: 'Knowledge Base' } : location.pathname === '/admin/technicians/workload' ? { title: 'Technician Workload' } : location.pathname.startsWith('/admin/tickets/') ? { title: 'Ticket Details' } : location.pathname.startsWith('/admin/categories/') ? { title: location.pathname.endsWith('/new') ? 'Add Category' : 'Edit Category' } : location.pathname === '/admin/users/new' ? { title: 'Create User' } : adminNavigation.find(item => matchPath({ path: item.path, end: true }, location.pathname))
  const name = [user?.firstName, user?.lastName].filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).join(' ')
  const displayName = name || (typeof user?.email === 'string' && user.email.trim()) || 'Admin'
  return <WorkspaceShell role="Admin" title={page?.title || 'Admin workspace'} displayName={displayName} navigation={adminNavigation} />
}

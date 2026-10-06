import SkipLink from './SkipLink'
import PageContainer from './PageContainer'
import WorkspaceHeader from './WorkspaceHeader'
import { NavLink, Outlet, matchPath } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import LogoutButton from '../auth/LogoutButton'
import { employeeNavigation } from './employeeNavigation'
import { useWorkspaceMenu } from './useWorkspaceMenu'

export default function EmployeeLayout() {
  const { user } = useAuth()
  const { location, menuButton, menuOpen, closeMenu, toggleMenu } = useWorkspaceMenu()
  const currentPage = employeeNavigation.find(item => matchPath({ path: item.path, end: item.end !== false }, location.pathname))
  const name = [user?.firstName, user?.lastName]
    .filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim()).join(' ')
  const displayName = name || (typeof user?.email === 'string' && user.email.trim()) || 'Employee'

  return (
    <div className="employee-ui min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <SkipLink />
      <aside className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-6">
          <div className="min-w-0">
            <p className="text-xl font-bold tracking-tight text-teal-800 dark:text-teal-300">SupportFlow</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Employee workspace</p>
          </div>
          <button ref={menuButton} type="button" aria-label={menuOpen ? 'Close employee menu' : 'Open employee menu'} aria-expanded={menuOpen} aria-controls="employee-navigation" onClick={toggleMenu} className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400 lg:hidden">
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
        <div id="employee-navigation" className={`${menuOpen ? 'block' : 'hidden'} px-3 pb-6 lg:block`} onKeyDown={event => {
          if (event.key === 'Escape' && menuOpen) { event.preventDefault(); closeMenu() }
        }}>
          <nav aria-label="Employee navigation">
            <ul className="space-y-1">
              {employeeNavigation.map(item => (
                <li key={item.path}>
                  <NavLink to={item.path} end={item.end !== false} onClick={() => { if (menuOpen) closeMenu() }} className={({ isActive }) => `block rounded-lg px-3 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400 ${isActive ? 'bg-teal-50 dark:bg-teal-950 text-teal-900 dark:text-teal-200 ring-1 ring-inset ring-teal-200 dark:ring-teal-800' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'}`}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-6 border-t border-slate-200 dark:border-slate-700 px-3"><LogoutButton /></div>
        </div>
      </aside>
      <div className="min-w-0">
        <WorkspaceHeader title={currentPage?.title || 'Employee workspace'} displayName={displayName} role="Employee" />
        <PageContainer id="main-content"><Outlet /></PageContainer>
      </div>
    </div>
  )
}

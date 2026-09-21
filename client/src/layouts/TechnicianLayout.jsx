import { NavLink, Outlet, matchPath } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import LogoutButton from '../auth/LogoutButton'
import { technicianNavigation } from './technicianNavigation'
import { useWorkspaceMenu } from './useWorkspaceMenu'

export default function TechnicianLayout() {
  const { user } = useAuth()
  const { location, menuButton, menuOpen, closeMenu, toggleMenu } = useWorkspaceMenu()
  const currentPage = technicianNavigation.find(item => matchPath({ path: item.path, end: true }, location.pathname))
  const name = [user?.firstName, user?.lastName]
    .filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).join(' ')
  const displayName = name || (typeof user?.email === 'string' && user.email.trim()) || 'Technician'

  return <div className="min-h-screen bg-slate-50 text-slate-900 [overflow-wrap:anywhere] lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] [&_.break-words]:[overflow-wrap:anywhere] [&_button]:min-h-11 [&_button]:max-w-full">
    <a href="#technician-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:text-teal-800">Skip to main content</a>
    <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto lg:border-r lg:border-b-0">
      <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-6">
        <div className="min-w-0">
          <p className="text-xl font-bold tracking-tight text-teal-800">SupportFlow</p>
          <p className="mt-1 text-sm text-slate-500">Technician workspace</p>
        </div>
        <button ref={menuButton} type="button" aria-label={menuOpen ? 'Close technician menu' : 'Open technician menu'} aria-expanded={menuOpen} aria-controls="technician-navigation" onClick={toggleMenu} className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 lg:hidden">{menuOpen ? 'Close' : 'Menu'}</button>
      </div>
      <div id="technician-navigation" className={`${menuOpen ? 'flex' : 'hidden'} flex-col px-3 pb-6 lg:flex lg:flex-1`} onKeyDown={event => {
        if (event.key === 'Escape' && menuOpen) { event.preventDefault(); closeMenu() }
      }}>
        <nav aria-label="Technician navigation">
          <ul className="space-y-1">
            {technicianNavigation.map(item => <li key={item.path}>
              <NavLink to={item.path} end onClick={() => { if (menuOpen) closeMenu() }} className={({ isActive }) => `block rounded-lg px-3 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${isActive ? 'bg-teal-50 text-teal-900 underline underline-offset-4 ring-1 ring-inset ring-teal-200' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>{item.label}</NavLink>
            </li>)}
          </ul>
        </nav>
        <div className="mt-6 pt-6 lg:mt-auto"><div className="border-t border-slate-200 px-3"><LogoutButton /></div></div>
      </div>
    </aside>
    <div className="min-w-0">
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="min-w-0 font-semibold">{currentPage?.title || 'Technician workspace'}</p>
        <div className="min-w-0 sm:max-w-[60%] sm:text-right"><p className="text-sm font-medium">{displayName}</p><p className="mt-1 text-xs text-slate-500">Technician</p></div>
      </header>
      <main id="technician-content" tabIndex={-1} className="w-full min-w-0 p-4 sm:p-6 lg:p-8"><Outlet /></main>
    </div>
  </div>
}

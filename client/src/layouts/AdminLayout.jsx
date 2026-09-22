import { NavLink, Outlet, matchPath } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import LogoutButton from '../auth/LogoutButton'
import { useWorkspaceMenu } from './useWorkspaceMenu'
import { adminNavigation } from './adminNavigation'

export default function AdminLayout() {
  const { user } = useAuth()
  const { location, menuButton, menuOpen, closeMenu, toggleMenu } = useWorkspaceMenu()
  const page = adminNavigation.find(item => matchPath({ path: item.path, end: true }, location.pathname))
  const name = [user?.firstName, user?.lastName].filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).join(' ')
  const displayName = name || (typeof user?.email === 'string' && user.email.trim()) || 'Admin'
  return <div className="min-h-screen bg-slate-50 text-slate-900 [overflow-wrap:anywhere] lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] [&_button]:min-h-11 [&_button]:max-w-full">
    <a href="#admin-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:text-teal-800">Skip to main content</a>
    {menuOpen && <button type="button" tabIndex={-1} aria-label="Close admin menu overlay" onClick={closeMenu} className="fixed inset-0 z-20 bg-slate-900/40 lg:hidden" />}
    <aside className="relative z-30 border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:min-h-0 lg:flex-col lg:border-r lg:border-b-0" onKeyDown={event => { if (event.key === 'Escape' && menuOpen) { event.preventDefault(); closeMenu() } }}>
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-6">
        <div className="min-w-0"><p className="text-xl font-bold tracking-tight text-teal-800">SupportFlow</p><p className="mt-1 text-sm text-slate-500">Admin workspace</p></div>
        <button ref={menuButton} type="button" aria-label={menuOpen ? 'Close admin menu' : 'Open admin menu'} aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={toggleMenu} className="shrink-0 cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 lg:hidden">{menuOpen ? 'Close' : 'Menu'}</button>
      </div>
      <div id="admin-navigation" className={`${menuOpen ? 'flex' : 'hidden'} absolute top-full left-0 max-h-[calc(100dvh-7rem)] w-full flex-col overflow-y-auto border-b border-slate-200 bg-white lg:static lg:flex lg:max-h-none lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:border-0`}>
        <nav aria-label="Admin navigation" className="px-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:py-1">
          <ul className="space-y-1">{adminNavigation.map(item => <li key={item.path}>
            <NavLink to={item.path} end onClick={() => { if (menuOpen) closeMenu() }} className={({ isActive }) => `block rounded-lg px-3 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${isActive ? 'bg-teal-50 text-teal-900 ring-1 ring-inset ring-teal-200' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>{item.label}</NavLink>
          </li>)}</ul>
        </nav>
        <div className="shrink-0 px-6 pb-6 pt-3"><div className="border-t border-slate-200"><LogoutButton /></div></div>
      </div>
    </aside>
    <div className="min-w-0">
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="min-w-0 font-semibold">{page?.title || 'Admin workspace'}</p>
        <div className="min-w-0 sm:max-w-[60%] sm:text-right"><p className="text-sm font-medium">{displayName}</p><p className="mt-1 text-xs text-slate-500">Admin</p></div>
      </header>
      <main id="admin-content" tabIndex={-1} className="w-full min-w-0 p-4 sm:p-6 lg:p-8"><Outlet /></main>
    </div>
  </div>
}

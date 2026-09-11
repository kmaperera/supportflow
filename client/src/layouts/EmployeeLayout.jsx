import { useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, matchPath } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import LogoutButton from '../auth/LogoutButton'
import { employeeNavigation } from './employeeNavigation'

export default function EmployeeLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const [openLocation, setOpenLocation] = useState(null)
  const menuButton = useRef(null)
  const menuOpen = openLocation === location
  const currentPage = employeeNavigation.find(item => matchPath({ path: item.path, end: true }, location.pathname))
  const name = [user?.firstName, user?.lastName]
    .filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim()).join(' ')
  const displayName = name || (typeof user?.email === 'string' && user.email.trim()) || 'Employee'

  function closeMenu() {
    setOpenLocation(null)
    menuButton.current?.focus()
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a href="#employee-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:text-teal-800">Skip to main content</a>
      <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-4 px-5 py-6">
          <div>
            <p className="text-xl font-bold tracking-tight text-teal-800">SupportFlow</p>
            <p className="mt-1 text-sm text-slate-500">Employee workspace</p>
          </div>
          <button ref={menuButton} type="button" aria-label={menuOpen ? 'Close employee menu' : 'Open employee menu'} aria-expanded={menuOpen} aria-controls="employee-navigation" onClick={() => setOpenLocation(menuOpen ? null : location)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 lg:hidden">
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
                  <NavLink to={item.path} end onClick={() => { if (menuOpen) closeMenu() }} className={({ isActive }) => `block rounded-lg px-3 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${isActive ? 'bg-teal-50 text-teal-900 ring-1 ring-inset ring-teal-200' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-6 border-t border-slate-200 px-3"><LogoutButton /></div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
          <p className="font-semibold">{currentPage?.title || 'Employee workspace'}</p>
          <div className="min-w-0">
            <p className="break-words text-sm font-medium">{displayName}</p>
            <p className="mt-1 text-xs text-slate-500">Employee</p>
          </div>
        </header>
        <main id="employee-content" tabIndex={-1} className="min-w-0 p-5 sm:p-8"><Outlet /></main>
      </div>
    </div>
  )
}

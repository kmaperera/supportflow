import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { AuthContext } from '../src/auth/AuthContext'
import ThemeProvider from '../src/theme/ThemeProvider'
import EmployeeLayout from '../src/layouts/EmployeeLayout'
import TechnicianLayout from '../src/layouts/TechnicianLayout'
import AdminLayout from '../src/layouts/AdminLayout'
import ConfirmDialog from '../src/components/ConfirmDialog'
import NavigationFocus from '../src/components/NavigationFocus'
import DocumentTitle from '../src/components/DocumentTitle'
import '../src/index.css'

export function Page() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate(), location = useLocation()
  useEffect(() => {
    window.navigateFixture = navigate
    window.openConfirmation = () => setOpen(true)
  }, [navigate])
  return <div className="layout-page" style={{ minHeight: 2000 }}>
    <h1>Navigation fixture</h1><p id="route">{location.pathname}</p>
    <button id="confirm-trigger" onClick={() => setOpen(true)}>Open confirmation</button>
    <ConfirmDialog open={open} title="Confirm fixture action?" description="No server mutation is made." confirmLabel="Confirm Action" onCancel={() => setOpen(false)} onConfirm={() => setOpen(false)} />
  </div>
}
const role = new URLSearchParams(location.search).get('role') || 'admin'
const Layout = { employee: EmployeeLayout, technician: TechnicianLayout, admin: AdminLayout }[role]
window.fixture = { logouts: 0 }
const auth = { user: { firstName: 'Malith', lastName: 'Perera With A Long Display Name', role: role.toUpperCase() }, logoutUser: async () => { window.fixture.logouts++ } }
const root = createRoot(document.getElementById('root'))
window.unmountFixture = () => root.unmount()
root.render(<ThemeProvider><AuthContext.Provider value={auth}><MemoryRouter initialEntries={[`/${role}`]}><NavigationFocus /><DocumentTitle /><Routes><Route element={<Layout />}><Route path="*" element={<Page />} /></Route></Routes></MemoryRouter></AuthContext.Provider></ThemeProvider>)

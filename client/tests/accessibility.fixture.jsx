import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import { AuthContext } from '../src/auth/AuthContext'
import ThemeProvider from '../src/theme/ThemeProvider'
import ToastProvider from '../src/components/ToastProvider'
import DocumentTitle from '../src/components/DocumentTitle'
import NavigationFocus from '../src/components/NavigationFocus'
import EmployeeLayout from '../src/layouts/EmployeeLayout'
import TechnicianLayout from '../src/layouts/TechnicianLayout'
import AdminLayout from '../src/layouts/AdminLayout'
import AdminKnowledgeBasePage from '../src/pages/admin/AdminKnowledgeBasePage'
import CreateUserPage from '../src/pages/admin/CreateUserPage'
import AdminAnalyticsPage from '../src/pages/admin/AdminAnalyticsPage'
import NotificationsPage from '../src/pages/shared/NotificationsPage'
import LoginPage from '../src/pages/auth/LoginPage'
import { MyTicketsList } from '../src/pages/employee/MyTicketsPage'
import { PublicCommentList } from '../src/pages/employee/TicketConversation'
import { InternalNoteList } from '../src/pages/technician/TicketInternalNotes'
import { TechnicianCombobox } from '../src/pages/admin/AdminTicketAssignment'
import ContentSkeleton from '../src/components/ContentSkeleton'
import ConfirmDialog from '../src/components/ConfirmDialog'
import ErrorState from '../src/components/ErrorState'
import { StatusBadge, PriorityBadge, StateBadge } from '../src/components/Badges'
import api from '../src/api/axios'
import '../src/index.css'

// All data is local; no real API, authentication, socket, or mutation is used.
const date = '2026-10-01T12:00:00Z'
const pagination = { page: 1, limit: 10, totalRecords: 1, totalPages: 1 }
const notification = { id: 1, ticketId: 1, type: 'PUBLIC_COMMENT', title: 'Printer update', message: 'A technician replied.', createdAt: date, isRead: false }
window.requests = []
api.defaults.adapter = async config => {
  window.requests.push(config.url)
  let data
  if (config.url.endsWith('/categories')) data = { categories: [{ id: 1, name: 'Getting started', isActive: true }] }
  else if (config.url.endsWith('/articles')) data = { articles: [{ id: 1, title: 'Printer guide', categoryName: 'Getting started', status: 'PUBLISHED', createdAt: date, updatedAt: date, viewCount: 4 }], pagination }
  else if (config.url.endsWith('/notifications/1/read')) data = { notification: { ...notification, isRead: true } }
  else if (config.url.endsWith('/notifications')) data = { notifications: [notification], unreadCount: 1, pagination }
  else if (config.url.endsWith('/status-distribution')) data = { distribution: [{ status: 'OPEN', count: 10 }, { status: 'RESOLVED', count: 6 }] }
  else if (config.url.endsWith('/ticket-trend')) data = { period: 'monthly', trend: [{ month: '2026-09', count: 4 }, { month: '2026-10', count: 12 }] }
  else if (config.url.endsWith('/technician-workload')) data = { technicians: [{ technicianId: 1, technicianName: 'Alex Lee', isActive: true, activeTickets: 3, resolvedTickets: 7 }] }
  else throw Error(`Fixture has no response for ${config.url}`)
  return { config, status: 200, headers: {}, data: { success: true, data } }
}

export function SharedFixture() {
  const [selected, setSelected] = useState('')
  const [open, setOpen] = useState(false)
  return <div className="layout-page">
    <h1>Accessibility fixture</h1><Link to="/next">Open next page</Link>
    <MyTicketsList tickets={[{ id: 1, ticketNumber: 'SF-001', title: 'Printer offline', status: 'OPEN', createdAt: date }]} totalRecords={1} />
    <section><h2>Conversation</h2><PublicCommentList comments={[{ id: 1, author: { firstName: 'Alex', role: 'TECHNICIAN' }, commentType: 'PUBLIC', content: 'Please restart the printer.', createdAt: date }]} /></section>
    <section><h2>Internal notes</h2><InternalNoteList notes={[{ id: 2, author: { firstName: 'Sam', role: 'ADMIN' }, commentType: 'INTERNAL', content: 'Check the network.', createdAt: date }]} /></section>
    <TechnicianCombobox technicians={[{ id: 1, firstName: 'Current' }, { id: 2, firstName: 'Alex' }]} counts={new Map()} selected={selected} currentId={1} onSelect={setSelected} />
    <button id="confirmation" onClick={() => setOpen(true)}>Open confirmation</button>
    <ConfirmDialog open={open} title="Deactivate user?" description="Alex will no longer be able to sign in." confirmLabel="Deactivate User" onConfirm={() => setOpen(false)} onCancel={() => setOpen(false)} />
    <ContentSkeleton initial>Loading sample tickets...</ContentSkeleton>
    <ErrorState compact title="Unable to load sample data" />
    <div data-contrast="badges">{['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED', 'REOPENED'].map(value => <StatusBadge key={value} value={value} />)}{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(value => <PriorityBadge key={value} value={value} />)}{['ACTIVE', 'INACTIVE', 'WARNING', 'BREACHED', 'UNREAD'].map(value => <StateBadge key={value} value={value} />)}</div>
  </div>
}
const params = new URLSearchParams(location.search)
const page = params.get('page') || 'shared'
const role = params.get('role') || 'admin'
const Layout = { employee: EmployeeLayout, technician: TechnicianLayout, admin: AdminLayout }[role]
const Page = { shared: SharedFixture, kb: AdminKnowledgeBasePage, form: CreateUserPage, analytics: AdminAnalyticsPage, notifications: NotificationsPage, login: LoginPage }[page]
const auth = { user: { id: 9, firstName: 'Malith', lastName: 'Perera', role: role.toUpperCase() }, logoutUser: async () => {}, loginUser: async () => {} }
createRoot(document.getElementById('root')).render(<ThemeProvider><ToastProvider><AuthContext.Provider value={auth}><MemoryRouter><DocumentTitle /><NavigationFocus />{page === 'login' ? <LoginPage /> : <Routes><Route element={<Layout />}><Route path="/" element={<Page />} /><Route path="/next" element={<h1>Next page</h1>} /></Route></Routes>}</MemoryRouter></AuthContext.Provider></ToastProvider></ThemeProvider>)

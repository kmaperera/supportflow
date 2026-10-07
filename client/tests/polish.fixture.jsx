import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App'
import { AuthContext } from '../src/auth/AuthContext'
import ThemeProvider from '../src/theme/ThemeProvider'
import ToastProvider from '../src/components/ToastProvider'
import { useToast } from '../src/components/toastContext'
import api from '../src/api/axios'
import '../src/index.css'

const route = new URLSearchParams(location.search).get('route') || '/admin'
const role = route.startsWith('/employee') ? 'EMPLOYEE' : route.startsWith('/technician') ? 'TECHNICIAN' : 'ADMIN'
const long = 'LongUnbrokenValue'.repeat(8)
const date = '2026-10-01T12:00:00Z'
const person = { id: 9, firstName: 'Malith', lastName: `Perera ${long}`, email: `${long}@example.test`, role, isActive: true, createdAt: date, department: long, mustChangePassword: route === '/change-password' }
const category = { id: 1, name: long, isActive: true, description: 'Office equipment and connectivity', createdAt: date }
const ticket = { id: 1, ticketNumber: 'SF-000001', title: `Printer offline ${long}`, description: `Please check the printer.\n${long}`, status: 'ASSIGNED', createdBy: 9, assignedTo: 9, creator: person, assignee: person, category, priority: { id: 1, name: 'HIGH' }, createdAt: date, updatedAt: date }
const article = { id: 1, title: `Printer guide ${long}`, categoryId: 1, categoryName: category.name, status: 'PUBLISHED', content: `Restart the printer.\n${long}`, createdAt: date, updatedAt: date, viewCount: 4 }
const pagination = { page: 1, currentPage: 1, limit: 10, total: 1, totalItems: 1, totalRecords: 1, totalPages: 1, hasNext: false, hasPrevious: false, hasNextPage: false, hasPreviousPage: false }
const milestone = { trackedTickets: 10, metTickets: 6, missedTickets: 2, pendingTickets: 2, completedTickets: 8, compliancePercentage: 75 }
const summary = { totalTickets: 10, activeTickets: 6, activeAssignedTickets: 6, unassignedTickets: 2, openTickets: 2, assignedTickets: 3, inProgressTickets: 1, waitingForUserTickets: 1, resolvedTickets: 2, closedTickets: 1, reopenedTickets: 0, respondedTickets: 8, averageFirstResponseMinutes: 30, averageResolutionMinutes: 120, totalRatings: 3, satisfiedRatings: 2, averageRating: 4, satisfactionPercentage: 66.7, response: milestone, resolution: milestone }
const technician = { ...person, technicianId: 9, technicianName: `${person.firstName} ${person.lastName}`, activeTickets: 6, resolvedTickets: 2, workload: { totalActive: 6, assigned: 3, inProgress: 1, waitingForUser: 1, reopened: 1 } }
window.fixtureRequests = []
api.defaults.adapter = async config => {
  window.fixtureRequests.push(config.url)
  if (config.method !== 'get') throw Error('This visual fixture does not perform mutations')
  const data = { summary, tickets: [ticket], ticket, users: [person], technicians: [technician], categories: [category], category, priorities: [{ id: 1, name: 'HIGH' }], policies: [{ id: 1, priorityName: 'HIGH', isActive: true, responseTimeMinutes: 60, resolutionTimeMinutes: 240, updatedAt: date }], articles: [article], article, pagination,
    comments: [{ id: 1, commentType: 'PUBLIC', author: person, content: `Investigating the connection. ${long}`, createdAt: date }, { id: 2, commentType: 'INTERNAL', author: person, content: `Check network configuration. ${long}`, createdAt: date }],
    attachments: [{ id: 1, originalName: `${long}.pdf`, mimeType: 'application/pdf', fileSize: 12345, uploadedBy: person, createdAt: date, downloadPath: '/api/v1/tickets/1/attachments/1/download' }], history: [],
    notifications: [{ id: 1, ticketId: 1, type: 'PUBLIC_COMMENT', title: `Printer update ${long}`, message: long, isRead: false, createdAt: date }], unreadCount: 1,
    logs: [{ id: 1, action: `TICKET_UPDATED_${long}`, createdAt: date, actor: { name: person.firstName, email: person.email, role }, entityType: 'Ticket', entityId: 1, description: long, metadata: { isDemo: true, schemaVersion: 1 } }],
    distribution: [{ status: 'OPEN', priorityId: 1, priorityName: 'HIGH', categoryName: long, count: 6 }], period: config.params?.period || 'monthly', trend: [{ date: '2026-10-01', month: '2026-10', count: 6 }],
    report: { rows: [{ ...ticket, requester: { name: person.firstName }, assignedTechnician: { name: person.firstName } }], pagination } }
  return { config, status: 200, headers: {}, data: { success: true, data, pagination } }
}
export function ToastControls() {
  const toast = useToast()
  useEffect(() => { window.showPolishToast = () => toast.info(`Saved ${long}`) }, [toast])
  return null
}
const auth = { user: person, isAuthenticated: route !== '/login', isInitializing: false, logoutUser: async () => {}, clearAuthError: () => {}, setAuthError: () => {} }
createRoot(document.getElementById('root')).render(<ThemeProvider><ToastProvider><ToastControls /><AuthContext.Provider value={auth}><MemoryRouter initialEntries={[route]}><App /></MemoryRouter></AuthContext.Provider></ToastProvider></ThemeProvider>)

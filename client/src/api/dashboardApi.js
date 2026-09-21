import api from './axios'
import { API_ENDPOINTS } from './endpoints'

export async function getTechnicianDashboard({ signal } = {}) {
  const [summaryResponse, recentResponse, slaResponse] = await Promise.all([
    api.get(`${API_ENDPOINTS.DASHBOARD}/technician/summary`, { signal }),
    api.get(`${API_ENDPOINTS.DASHBOARD}/recent-tickets`, { params: { limit: 5 }, signal }),
    api.get(`${API_ENDPOINTS.DASHBOARD}/sla-compliance`, { signal }),
  ])
  const summary = summaryResponse.data?.data?.summary
  const tickets = recentResponse.data?.data?.tickets
  const sla = slaResponse.data?.data?.summary
  const validCounts = (value, keys) => value && keys.every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)
  if ([summaryResponse, recentResponse, slaResponse].some(response => response.data?.success !== true) ||
      !validCounts(summary, ['assignedTickets', 'inProgressTickets', 'waitingForUserTickets', 'reopenedTickets', 'resolvedTickets', 'activeAssignedTickets']) ||
      !Array.isArray(tickets) || tickets.some(ticket => !ticket?.id || typeof ticket.ticketNumber !== 'string' || typeof ticket.title !== 'string') ||
      !['response', 'resolution'].every(kind => validCounts(sla?.[kind], ['metTickets', 'missedTickets', 'pendingTickets']))) {
    throw new Error('Invalid technician dashboard response')
  }
  return { summary, tickets, sla }
}

export async function getEmployeeDashboard({ signal } = {}) {
  const [summaryResponse, recentResponse] = await Promise.all([
    api.get(`${API_ENDPOINTS.DASHBOARD}/employee/summary`, { signal }),
    api.get(`${API_ENDPOINTS.DASHBOARD}/recent-tickets`, { params: { limit: 5 }, signal }),
  ])
  const summary = summaryResponse.data?.data?.summary
  const tickets = recentResponse.data?.data?.tickets
  const counts = ['totalTickets', 'activeTickets', 'openTickets', 'assignedTickets',
    'inProgressTickets', 'waitingForUserTickets', 'resolvedTickets', 'closedTickets', 'reopenedTickets']
  if (summaryResponse.data?.success !== true || recentResponse.data?.success !== true ||
      !summary || !counts.every(key => Number.isSafeInteger(summary[key]) && summary[key] >= 0) ||
      !Array.isArray(tickets)) throw new Error('Invalid dashboard response')
  return { summary, tickets }
}

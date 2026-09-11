import api from './axios'
import { API_ENDPOINTS } from './endpoints'

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

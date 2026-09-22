import api from './axios'
import { API_ENDPOINTS } from './endpoints'

const workloadSections = {
  status: ['status-distribution', 'distribution'],
  priority: ['priority-distribution', 'distribution'],
  response: ['average-first-response-time', 'summary'],
  resolution: ['average-resolution-time', 'summary'],
  sla: ['sla-compliance', 'summary'],
}
export async function getDashboardStatisticsSection(section, { signal } = {}) {
  const contract = workloadSections[section]
  if (!contract) throw new Error('Unknown statistics section')
  const { data } = await api.get(`${API_ENDPOINTS.DASHBOARD}/${contract[0]}`, { signal })
  const result = data?.data?.[contract[1]]
  const count = value => Number.isSafeInteger(value) && value >= 0
  const duration = value => value === null || (Number.isFinite(value) && value >= 0)
  let valid = false
  if (section === 'status' || section === 'priority') valid = Array.isArray(result) && result.every(row => count(row.count) && typeof row[section === 'status' ? 'status' : 'priorityName'] === 'string')
  if (section === 'response') valid = result && count(result.respondedTickets) && duration(result.averageFirstResponseMinutes)
  if (section === 'resolution') valid = result && count(result.resolvedTickets) && duration(result.averageResolutionMinutes)
  if (section === 'sla') valid = ['response', 'resolution'].every(kind => {
    const value = result?.[kind]
    return value && ['trackedTickets', 'metTickets', 'missedTickets', 'pendingTickets', 'completedTickets'].every(key => count(value[key])) &&
      (value.compliancePercentage === null || (Number.isFinite(value.compliancePercentage) && value.compliancePercentage >= 0 && value.compliancePercentage <= 100))
  })
  if (data?.success !== true || !valid) throw new Error('Invalid workload statistics response')
  return result
}

export const getTechnicianStatisticsSection = getDashboardStatisticsSection

export async function getAdminDashboardSection(section, { signal } = {}) {
  if (section === 'workload') {
    const { data } = await api.get(`${API_ENDPOINTS.DASHBOARD}/technician-workload`, { signal })
    const technicians = data?.data?.technicians
    if (data?.success !== true || !Array.isArray(technicians) || technicians.some(row => !row?.technicianId || typeof row.technicianName !== 'string' || !Number.isSafeInteger(row.activeTickets) || row.activeTickets < 0)) throw new Error('Invalid technician workload response')
    return technicians
  }
  if (['priority', 'sla'].includes(section)) return getDashboardStatisticsSection(section, { signal })
  if (!['summary', 'recent'].includes(section)) throw new Error('Unknown admin dashboard section')
  const { data } = await api.get(`${API_ENDPOINTS.DASHBOARD}/${section === 'summary' ? 'admin/summary' : 'recent-tickets'}`, { signal, ...(section === 'recent' ? { params: { limit: 5 } } : {}) })
  const value = data?.data?.[section === 'summary' ? 'summary' : 'tickets']
  const valid = section === 'summary'
    ? value && ['totalTickets', 'activeTickets', 'unassignedTickets', 'openTickets', 'assignedTickets', 'inProgressTickets', 'waitingForUserTickets', 'resolvedTickets', 'closedTickets', 'reopenedTickets'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)
    : Array.isArray(value) && value.every(ticket => ticket?.id && typeof ticket.ticketNumber === 'string' && typeof ticket.title === 'string')
  if (data?.success !== true || !valid) throw new Error('Invalid admin dashboard response')
  return value
}

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

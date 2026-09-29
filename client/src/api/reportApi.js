import api from './axios'
import { API_ENDPOINTS } from './endpoints'

const dates = ['startDate', 'endDate']
export const reportTypes = {
  tickets: { label: 'Ticket Report', fields: [...dates, 'status', 'priorityId', 'categoryId', 'technicianId', 'search', 'sortBy', 'sortOrder'], rows: 'rows' },
  'date-range': { label: 'Date-range Report', fields: dates, rows: 'dailyBreakdown' },
  'technician-performance': { label: 'Technician Performance Report', fields: dates, rows: 'technicians' },
  sla: { label: 'SLA Report', fields: [...dates, 'priorityId', 'categoryId', 'technicianId'] },
  categories: { label: 'Category Report', fields: [...dates, 'priorityId', 'technicianId'], rows: 'categories' },
  priorities: { label: 'Priority Report', fields: [...dates, 'categoryId', 'technicianId'], rows: 'priorities' },
  statuses: { label: 'Status Report', fields: [...dates, 'categoryId', 'priorityId', 'technicianId'], rows: 'statuses' },
}
export function buildReportParams(type, values, page = 1) {
  if (!Object.hasOwn(reportTypes, type)) throw new Error('Unknown report')
  const params = {}
  for (const field of reportTypes[type].fields) {
    const value = typeof values[field] === 'string' ? values[field].trim() : values[field]
    if (value !== undefined && value !== '') params[field] = value
  }
  if (type === 'tickets') Object.assign(params, { page, limit: 25 })
  return params
}
export async function getReport(type, values, { page = 1, signal } = {}) {
  const params = buildReportParams(type, values, page)
  const { data } = await api.get(`${API_ENDPOINTS.REPORTS}/${type}`, { params, signal })
  const report = data?.data?.report
  if (data?.success !== true || !report || (reportTypes[type].rows && !Array.isArray(report[reportTypes[type].rows])) || (type === 'tickets' && !report.pagination) || (type === 'sla' && (!report.responseSla || !report.resolutionSla))) throw new Error('Invalid report response')
  return report
}

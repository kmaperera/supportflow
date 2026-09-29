import api from './axios'
import { API_ENDPOINTS } from './endpoints'
import { buildReportParams, reportTypes } from './reportApi'
import { getApiErrorMessage } from './apiError'

export function reportExportFilename(disposition, type, format) {
  const fallback = `${type}-report-${new Date().toISOString().slice(0, 10)}.${format}`
  if (typeof disposition !== 'string') return fallback
  let filename
  const extended = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition)
  try { if (extended) filename = decodeURIComponent(extended[1].trim()) } catch { /* Try the plain filename. */ }
  if (!filename) filename = /filename\s*=\s*"([^"]+)"/i.exec(disposition)?.[1] || /filename\s*=\s*([^;\s]+)/i.exec(disposition)?.[1]
  if (!filename || filename.length > 200 || [...filename].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || /[/\\:<>|?*]/.test(filename) || !filename.toLowerCase().endsWith(`.${format}`)) return fallback
  return filename
}
export async function exportReport(type, format, criteria, { signal } = {}) {
  if (!Object.hasOwn(reportTypes, type) || !['csv', 'pdf'].includes(format) || (format === 'pdf' && type !== 'tickets')) throw new Error('Unsupported report export')
  const params = buildReportParams(type, criteria)
  delete params.page
  delete params.limit
  const response = await api.get(`${API_ENDPOINTS.REPORTS}/${type}/export/${format}`, { params, signal, responseType: 'blob' })
  const mime = format === 'csv' ? 'text/csv' : 'application/pdf'
  const contentType = response.headers['content-type'] || response.data?.type || ''
  if (!(response.data instanceof Blob) || response.data.size === 0 || contentType.split(';')[0].trim().toLowerCase() !== mime) throw new Error('Invalid export file')
  if (format === 'pdf' && !(await response.data.slice(0, 5).text()).startsWith('%PDF-')) throw new Error('Invalid PDF file')
  return { blob: response.data, filename: reportExportFilename(response.headers['content-disposition'], type, format) }
}
export async function reportExportError(error) {
  let body = error?.response?.data
  if (body instanceof Blob && body.size < 65536) {
    try { body = JSON.parse(await body.text()) } catch { body = null }
  }
  const status = error?.response?.status
  if (status === 422) return 'Unable to export: please check the report criteria and generate the report again.'
  // Use the existing safe message policy, never arbitrary blob/server text.
  return getApiErrorMessage({ isAxiosError: error?.isAxiosError, response: error?.response ? { status, data: body } : undefined }, 'Unable to export report. Please try again.')
}

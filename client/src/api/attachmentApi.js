import api from './axios'
import { API_ENDPOINTS } from './endpoints'

export async function getTicketAttachments(ticketId, { signal } = {}) {
  const { data } = await api.get(`${API_ENDPOINTS.TICKETS}/${encodeURIComponent(ticketId)}/attachments`, { signal })
  if (data?.success !== true || !Array.isArray(data.data?.attachments)) throw new Error('Invalid attachments response')
  return data.data.attachments
}
export async function uploadTicketAttachment(ticketId, file) {
  const body = new FormData()
  body.append('attachment', file)
  const { data } = await api.post(`${API_ENDPOINTS.TICKETS}/${encodeURIComponent(ticketId)}/attachments`, body, { timeout: 60000 })
  if (data?.success !== true || !data.data?.attachment?.id) throw new Error('Invalid upload response')
  return data.data.attachment
}
export async function downloadTicketAttachment(ticketId, attachment) {
  const expected = `/api/v1/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(attachment.id)}/download`
  if (attachment.downloadPath !== expected) throw new Error('Invalid attachment download path')
  // The configured base URL already includes /api/v1. Keep authentication on our API.
  const { data } = await api.get(attachment.downloadPath.slice('/api/v1'.length), { responseType: 'blob', headers: { Accept: '*/*' }, timeout: 60000 })
  if (!(data instanceof Blob) || data.size === 0) throw new Error('Invalid attachment resource')
  return data
}

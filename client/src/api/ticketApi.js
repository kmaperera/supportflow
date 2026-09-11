import api from './axios'
import { API_ENDPOINTS } from './endpoints'

export async function createTicket({ title, description, categoryId, priorityId }) {
  const { data } = await api.post(API_ENDPOINTS.TICKETS, {
    title: title.trim(), description: description.trim(), categoryId, priorityId,
  })
  if (data?.success !== true || !data.data?.ticket?.id ||
      typeof data.data.ticket.ticketNumber !== 'string') throw new Error('Invalid ticket response')
  return data.data.ticket
}

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

async function getOptions(kind, signal) {
  const { data } = await api.get(`${API_ENDPOINTS.TICKETS}/${kind}`, { signal })
  const options = data?.data?.[kind]
  if (data?.success !== true || !Array.isArray(options) || options.some(option =>
    !option || !/^[1-9]\d*$/.test(String(option.id)) || typeof option.name !== 'string')) {
    throw new Error('Invalid ticket options response')
  }
  return options
}
export const getTicketCategories = ({ signal } = {}) => getOptions('categories', signal)
export const getTicketPriorities = ({ signal } = {}) => getOptions('priorities', signal)

import api from './axios'
import { API_ENDPOINTS } from './endpoints'

export async function getMyAssignedTickets({ page = 1, limit = 10, signal } = {}) {
  const { data } = await api.get(`${API_ENDPOINTS.TICKETS}/assigned-to-me`, { params: { page, limit }, signal })
  return readTechnicianTicketList(data)
}

export async function getUnassignedTickets({ page = 1, limit = 10, signal } = {}) {
  const { data } = await api.get(`${API_ENDPOINTS.TICKETS}/queue`, { params: { assignment: 'unassigned', page, limit }, signal })
  return readTechnicianTicketList(data)
}

function readTechnicianTicketList(data) {
  const pagination = data?.pagination
  const tickets = data?.data?.tickets
  if (data?.success !== true || !Array.isArray(tickets) ||
      tickets.some(ticket => !ticket?.id || typeof ticket.ticketNumber !== 'string' || typeof ticket.title !== 'string') ||
      !pagination || !Number.isSafeInteger(pagination.currentPage) || pagination.currentPage < 1 ||
      !Number.isSafeInteger(pagination.limit) || pagination.limit < 1 ||
      !Number.isSafeInteger(pagination.totalPages) || pagination.totalPages < 0 ||
      !Number.isSafeInteger(pagination.totalRecords) || pagination.totalRecords < 0 ||
      typeof pagination.hasNext !== 'boolean' || typeof pagination.hasPrevious !== 'boolean') {
    throw new Error('Invalid assigned ticket list response')
  }
  return { tickets, pagination }
}

export async function saveTicketFeedback(ticketId, { rating, comment }) {
  const { data } = await api.put(`${API_ENDPOINTS.TICKETS}/${encodeURIComponent(ticketId)}/feedback`, { rating, comment: comment.trim() })
  const feedback = data?.data?.feedback
  if (data?.success !== true || !feedback || !Number.isInteger(feedback.rating) || feedback.rating < 1 || feedback.rating > 5) throw new Error('Invalid feedback response')
  return feedback
}

export async function closeTicket(ticketId) {
  const { data } = await api.patch(`${API_ENDPOINTS.TICKETS}/${encodeURIComponent(ticketId)}/close`)
  if (data?.success !== true || !data.data?.ticket?.id) throw new Error('Invalid ticket close response')
  return data.data.ticket
}

export async function updateTicket(ticketId, { title, description, categoryId, priorityId }) {
  const { data } = await api.patch(`${API_ENDPOINTS.TICKETS}/${encodeURIComponent(ticketId)}`, {
    title: title.trim(), description: description.trim(), categoryId, priorityId,
  })
  if (data?.success !== true || !data.data?.ticket?.id) throw new Error('Invalid ticket update response')
  return data.data.ticket
}

export async function getTicketComments(ticketId, { signal } = {}) {
  const { data } = await api.get(`${API_ENDPOINTS.TICKETS}/${encodeURIComponent(ticketId)}/comments`, { signal })
  if (data?.success !== true || !Array.isArray(data.data?.comments)) throw new Error('Invalid conversation response')
  return data.data.comments.filter(comment => comment?.commentType === 'PUBLIC')
}

export async function addTicketComment(ticketId, { content }) {
  const { data } = await api.post(`${API_ENDPOINTS.TICKETS}/${encodeURIComponent(ticketId)}/comments`, { content: content.trim() })
  const comment = data?.data?.comment
  if (data?.success !== true || !comment?.id || comment.commentType !== 'PUBLIC') throw new Error('Invalid public reply response')
  return comment
}

export async function getTicketStatusHistory(ticketId, { signal } = {}) {
  const { data } = await api.get(`${API_ENDPOINTS.TICKETS}/${encodeURIComponent(ticketId)}/status-history`, { signal })
  if (data?.success !== true || !Array.isArray(data.data?.history)) throw new Error('Invalid status history response')
  return data.data.history
}

export async function getTicketById(ticketId, { signal } = {}) {
  const { data } = await api.get(`${API_ENDPOINTS.TICKETS}/${encodeURIComponent(ticketId)}`, { signal })
  if (data?.success !== true || !data.data?.ticket || typeof data.data.ticket !== 'object' || !data.data.ticket.id) {
    throw new Error('Invalid ticket detail response')
  }
  return data.data.ticket
}

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

export async function getMyTickets({ page = 1, limit = 10, search, status, categoryId, priorityId, sortBy, order, signal } = {}) {
  const params = { page, limit }
  for (const [key, value] of Object.entries({ search: search?.trim(), status, categoryId, priorityId, sortBy, order })) {
    if (value !== undefined && value !== '') params[key] = value
  }
  const { data } = await api.get(`${API_ENDPOINTS.TICKETS}/my`, { params, signal })
  const pagination = data?.pagination
  if (data?.success !== true || !Array.isArray(data.data?.tickets) || !pagination ||
      !Number.isInteger(pagination.currentPage) || pagination.currentPage < 1 ||
      !Number.isInteger(pagination.totalPages) || pagination.totalPages < 0 ||
      !Number.isInteger(pagination.totalRecords) || pagination.totalRecords < 0 ||
      typeof pagination.hasNext !== 'boolean' || typeof pagination.hasPrevious !== 'boolean') {
    throw new Error('Invalid ticket list response')
  }
  return { tickets: data.data.tickets, pagination }
}

export async function reopenTicket(ticketId) {
  const { data } = await api.patch(`${API_ENDPOINTS.TICKETS}/${encodeURIComponent(ticketId)}/reopen`)
  if (data?.success !== true || !data.data?.ticket?.id) throw new Error('Invalid ticket reopen response')
  return data.data.ticket
}

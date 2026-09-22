import api from './axios'
import { API_ENDPOINTS } from './endpoints'

export async function getUsers({ page = 1, limit = 20, search, role, isActive, sortBy = 'created_at', order = 'DESC', signal } = {}) {
  const params = { page, limit, sortBy, order }
  for (const [key, value] of Object.entries({ search: search?.trim(), role, isActive })) {
    if (value !== undefined && value !== '') params[key] = value
  }
  const { data } = await api.get(API_ENDPOINTS.USERS, { params, signal })
  const users = data?.data?.users
  const pagination = data?.pagination
  if (data?.success !== true || !Array.isArray(users) || users.some(user => !user?.id || typeof user.email !== 'string' || typeof user.isActive !== 'boolean') ||
    !pagination || !Number.isInteger(pagination.currentPage) || pagination.currentPage < 1 || !Number.isInteger(pagination.totalRecords) || pagination.totalRecords < 0 ||
    !Number.isInteger(pagination.totalPages) || pagination.totalPages < 0 || typeof pagination.hasNext !== 'boolean' || typeof pagination.hasPrevious !== 'boolean') throw new Error('Invalid users response')
  return { users, pagination }
}

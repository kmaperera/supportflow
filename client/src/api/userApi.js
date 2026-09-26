import api from './axios'
import { API_ENDPOINTS } from './endpoints'

export async function updateUserStatus(userId, isActive) {
  const { data } = await api.patch(`${API_ENDPOINTS.USERS}/${encodeURIComponent(userId)}/status`, { isActive })
  if (data?.success !== true || !data.data?.user?.id || typeof data.data.user.isActive !== 'boolean') throw new Error('Invalid user status response')
  return data.data.user
}

export async function createUser({ firstName, lastName, email, role, password, phone, department }) {
  const payload = { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim().toLowerCase(), role, password }
  for (const [key, value] of Object.entries({ phone, department })) if (value) payload[key] = value
  const { data } = await api.post(API_ENDPOINTS.USERS, payload)
  if (data?.success !== true || !data.data?.user?.id) throw new Error('Invalid create-user response')
  return data.data.user
}

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

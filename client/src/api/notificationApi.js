import api from './axios'
import { API_ENDPOINTS } from './endpoints'

function assertPublic(notification) {
  if (!notification || notification.type === 'INTERNAL_NOTE') throw new Error('Unexpected employee notification')
}
export async function getNotifications({ page = 1, signal } = {}) {
  const { data } = await api.get(API_ENDPOINTS.NOTIFICATIONS, { params: { page, limit: 20 }, signal })
  const result = data?.data
  if (data?.success !== true || !Array.isArray(result?.notifications) || !result.pagination || !Number.isInteger(result.unreadCount)) throw new Error('Invalid notifications response')
  result.notifications.forEach(assertPublic)
  return { ...result, notifications: [...new Map(result.notifications.map(item => [String(item.id), item])).values()] }
}
export async function markNotificationRead(id) {
  const { data } = await api.patch(`${API_ENDPOINTS.NOTIFICATIONS}/${encodeURIComponent(id)}/read`)
  const notification = data?.data?.notification
  if (data?.success !== true || notification?.isRead !== true) throw new Error('Invalid read response')
  assertPublic(notification)
  return notification
}
export async function markAllNotificationsRead() {
  const { data } = await api.patch(`${API_ENDPOINTS.NOTIFICATIONS}/read-all`)
  if (data?.success !== true || !Number.isInteger(data.data?.unreadCount)) throw new Error('Invalid read-all response')
  return data.data
}

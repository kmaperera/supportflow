import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
 const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
 const { getNotifications, markNotificationRead, markAllNotificationsRead } = await server.ssrLoadModule('/src/api/notificationApi.js')
 const notification = { id: 71, type: 'PUBLIC_COMMENT', isRead: true }
 api.defaults.adapter = async config => {
  if (config.method === 'get') {
   assert.equal(config.url, '/notifications'); assert.deepEqual(config.params, { page: 2, limit: 20 })
   return { config, status: 200, headers: {}, data: { success: true, data: { notifications: [notification, notification], pagination: { page: 2 }, unreadCount: 0 } } }
  }
  assert.equal(config.method, 'patch'); assert.equal(config.data, undefined)
  assert.ok(['/notifications/71/read', '/notifications/read-all'].includes(config.url))
  return { config, status: 200, headers: {}, data: { success: true, data: config.url.endsWith('read-all') ? { updatedCount: 1, unreadCount: 0 } : { notification } } }
 }
 assert.equal((await getNotifications({ page: 2, userId: 999 })).notifications.length, 1)
 assert.deepEqual(await markNotificationRead('71'), notification)
 assert.equal((await markAllNotificationsRead()).unreadCount, 0)
 api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: { success: true, data: { notifications: [{ ...notification, type: 'INTERNAL_NOTE' }], pagination: {}, unreadCount: 0 } } })
 await assert.rejects(() => getNotifications(), /Unexpected employee notification/)
 console.log('Notification endpoints, pagination parameters, deduplication, persisted read responses and internal rejection passed.')
} finally { await server.close() }

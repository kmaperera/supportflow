import assert from 'node:assert/strict'
import { createServer } from 'vite'
const vite = await createServer({ define: { 'import.meta.env.PROD': 'true' }, server: { middlewareMode: true }, appType: 'custom' })
try {
  const { subscribeToNotifications } = await vite.ssrLoadModule('/src/api/notificationRealtime.js')
  let options
  const cleanup = subscribeToNotifications({ token: 'fixture', origin: 'https://api.example.test', onRefresh() {} }, (_origin, config) => {
    options = config
    return { on() {}, off() {}, disconnect() {} }
  })
  assert.deepEqual(options.transports, ['websocket'])
  assert.equal(options.reconnection, true)
  cleanup()
  console.log('PASS: production Socket.IO forces websocket transport and retains reconnection.')
} finally { await vite.close() }

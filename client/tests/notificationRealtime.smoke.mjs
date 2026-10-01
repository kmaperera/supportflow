import assert from 'node:assert/strict'
import { subscribeToNotifications } from '../src/api/notificationRealtime.js'

const handlers = new Map()
let disconnected = false
let refreshed = 0
const received = []
const cleanup = subscribeToNotifications({ token: 'test-token', origin: 'http://localhost:5000', onNotification: item => received.push(item.id), onRefresh: () => { refreshed++ } }, (origin, options) => {
  assert.equal(origin, 'http://localhost:5000')
  assert.deepEqual(options, { auth: { token: 'test-token' }, withCredentials: true })
  return {
    on: (name, handler) => handlers.set(name, handler),
    off: (name, handler) => { assert.equal(handlers.get(name), handler); handlers.delete(name) },
    disconnect: () => { disconnected = true },
  }
})
const settle = () => new Promise(resolve => setTimeout(resolve, 190))
handlers.get('connect')()
await settle()
assert.equal(refreshed, 1)
handlers.get('notification:new')({ id: 51 })
handlers.get('notification:new')({ id: '51' })
handlers.get('notification:new')({ id: 52 })
await settle()
assert.equal(refreshed, 2, 'burst events coalesce into one authoritative REST refresh')
handlers.get('notification:new')({ id: 51 })
handlers.get('notification:new')({ id: 'invalid' })
await settle()
assert.equal(refreshed, 2, 'duplicate IDs and malformed events do not trigger refresh')
assert.deepEqual(received, [51, 52], 'toast callbacks receive only new valid notifications')
handlers.get('connect')()
await settle()
assert.equal(refreshed, 3, 'reconnection reconciles missed events')
handlers.get('notification:new')({ id: 53 })
cleanup()
await settle()
assert.equal(refreshed, 3, 'pending callbacks are cancelled on cleanup')
assert.equal(handlers.size, 0)
assert.equal(disconnected, true)
console.log('Notification socket authentication, coalescing, dedupe, reconnect and cleanup passed.')

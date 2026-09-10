import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const bridge = await server.ssrLoadModule('/src/auth/accessToken.js')
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { AuthProvider } = await server.ssrLoadModule('/src/auth/AuthProvider.jsx')
  const { useAuth } = await server.ssrLoadModule('/src/auth/useAuth.js')
  let auth
  // SSR-only test harness captures provider actions; this is not app render state.
  // oxlint-disable-next-line react/globals
  function Probe() { auth = useAuth(); return null }
  renderToString(React.createElement(AuthProvider, null, React.createElement(Probe)))
  assert.equal(auth.user, null)
  assert.equal(auth.accessToken, null)
  assert.equal(bridge.getAccessToken(), null)
  const headers = []
  api.defaults.adapter = async config => {
    headers.push(config.headers.get('Authorization'))
    assert.equal(config.withCredentials, true)
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
  }
  await api.get('/test')
  const user = { id: 1, role: 'EMPLOYEE', mustChangePassword: true }
  auth.establishSession(user, 'test-token-one')
  assert.equal(bridge.getAccessToken(), 'test-token-one')
  await api.get('/test')
  auth.establishSession(user, 'test-token-two')
  await api.get('/test')
  assert.throws(() => auth.establishSession(user, ''), TypeError)
  assert.equal(bridge.getAccessToken(), 'test-token-two')
  auth.clearSession()
  assert.equal(bridge.getAccessToken(), null)
  await api.get('/test', { headers: { Authorization: 'Bearer stale' } })
  assert.deepEqual(headers, [undefined, 'Bearer test-token-one', 'Bearer test-token-two', undefined])
  assert.equal(api.defaults.headers.common.Authorization, undefined)
  assert.equal(api.interceptors.response.handlers.filter(Boolean).length, 0)
  assert.equal(user.mustChangePassword, true)
  console.log('In-memory session bridge and Axios header smoke passed; no network requests made.')
} finally { await server.close() }

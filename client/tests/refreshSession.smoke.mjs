import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { refreshSession, login } = await server.ssrLoadModule('/src/api/authApi.js')
  const user = { id: 1, role: 'ADMIN', mustChangePassword: true, isActive: true }
  let calls = 0
  api.defaults.adapter = async config => {
    calls++
    assert.equal(config.url, '/auth/refresh')
    assert.equal(config.method, 'post')
    assert.equal(config.data, undefined)
    assert.equal(config.withCredentials, true)
    assert.equal(config.headers.get('Cookie'), undefined)
    return { data: { success: true, data: { user, accessToken: 'fresh-test-token' } }, status: 200, statusText: 'OK', headers: {}, config }
  }
  const result = await refreshSession()
  assert.equal(result.user, user)
  assert.equal(result.accessToken, 'fresh-test-token')
  assert.equal(calls, 1)
  for (const status of [401, 403, 500]) {
    const failure = { response: { status } }
    api.defaults.adapter = async () => { throw failure }
    await assert.rejects(refreshSession(), error => error === failure)
  }
  api.defaults.adapter = async config => ({ data: { success: true, data: { user } }, status: 200, statusText: 'OK', headers: {}, config })
  await assert.rejects(refreshSession(), /Invalid authentication response/)
  api.defaults.adapter = async config => {
    assert.equal(config.url, '/auth/login')
    assert.deepEqual(JSON.parse(config.data), { email: 'test@example.test', password: 'test-only' })
    return { data: { success: true, data: { user, accessToken: 'login-test-token' } }, status: 200, statusText: 'OK', headers: {}, config }
  }
  assert.equal((await login({ email: 'test@example.test', password: 'test-only' })).user, user)
  assert.equal(api.interceptors.response.handlers.filter(Boolean).length, 0)
  console.log('Mocked refresh contract, errors, malformed responses and login compatibility passed.')
} finally { await server.close() }

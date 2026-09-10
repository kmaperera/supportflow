import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { refreshSession, logout } = await server.ssrLoadModule('/src/api/authApi.js')
  const { setAccessToken, clearAccessToken } = await server.ssrLoadModule('/src/auth/accessToken.js')
  const { registerSessionHandlers } = await server.ssrLoadModule('/src/auth/sessionBridge.js')
  const calls = []
  let finishRefresh
  api.defaults.adapter = config => {
    calls.push(config.url)
    assert.equal(config.method, 'post')
    assert.equal(config.withCredentials, true)
    if (config.url === '/auth/refresh') return new Promise(resolve => {
      finishRefresh = () => resolve({ config, status: 200, headers: {}, data: {
        success: true, data: { user: { id: 1 }, accessToken: 'fresh-test-token' },
      } })
    })
    assert.equal(config.url, '/auth/logout')
    assert.equal(config.headers.get('Authorization'), undefined)
    return Promise.resolve({ config, status: 200, headers: {}, data: { success: true } })
  }
  const refresh = refreshSession()
  await new Promise(resolve => setImmediate(resolve))
  const pendingLogout = logout()
  assert.deepEqual(calls, ['/auth/refresh'])
  finishRefresh()
  await Promise.all([refresh, pendingLogout])
  assert.deepEqual(calls, ['/auth/refresh', '/auth/logout'])

  setAccessToken('test-token')
  const unregister = registerSessionHandlers({
    establishSession() { assert.fail('Logout must not refresh the session') },
    clearSession() { assert.fail('API must leave cleanup to the provider') },
  })
  api.defaults.adapter = async config => {
    assert.equal(config.url, '/auth/logout')
    throw { config, response: { status: 401 } }
  }
  await assert.rejects(logout)
  unregister()
  clearAccessToken()
  console.log('Logout POST, cookie credentials, pending rotation ordering and 401 exclusion passed.')
} finally {
  await server.close()
}

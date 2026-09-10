import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { refreshSession, logout, logoutAllSessions } = await server.ssrLoadModule('/src/api/authApi.js')
  const { setAccessToken, clearAccessToken, getAccessToken } = await server.ssrLoadModule('/src/auth/accessToken.js')
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
  api.defaults.adapter = async config => {
    assert.equal(config.url, '/auth/logout-all')
    assert.equal(config.method, 'post')
    assert.equal(config.withCredentials, true)
    assert.equal(config.data, undefined)
    assert.equal(config.headers.get('Authorization'), 'Bearer test-token')
    return { config, status: 200, headers: {}, data: { success: true } }
  }
  await logoutAllSessions()
  for (const status of [401, 500]) {
    api.defaults.adapter = async config => {
      assert.equal(config.url, '/auth/logout-all')
      throw { config, response: { status } }
    }
    await assert.rejects(logoutAllSessions)
    assert.equal(getAccessToken(), 'test-token')
  }
  api.defaults.adapter = async () => { throw new Error('Network unavailable') }
  await assert.rejects(logoutAllSessions)
  assert.equal(getAccessToken(), 'test-token')
  unregister()
  clearAccessToken()
  console.log('Logout and logout-all contracts, cookie credentials, rotation ordering, failure preservation and 401 exclusions passed.')
} finally {
  await server.close()
}

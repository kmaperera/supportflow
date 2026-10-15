import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { forgotPassword, resetPassword } = await server.ssrLoadModule('/src/api/authApi.js')
  const { requestUserPasswordReset } = await server.ssrLoadModule('/src/api/userApi.js')
  const { setAccessToken, clearAccessToken } = await server.ssrLoadModule('/src/auth/accessToken.js')
  const { registerSessionHandlers } = await server.ssrLoadModule('/src/auth/sessionBridge.js')
  const unregister = registerSessionHandlers({ establishSession() { throw Error('Recovery must not refresh') }, clearSession() { throw Error('Recovery must not clear unrelated session on error') } })
  const token = 'a'.repeat(64), payload = { token, newPassword: 'NewFixture123!', confirmPassword: 'NewFixture123!' }
  for (const [path, body, call] of [
    ['/auth/forgot-password', { email: 'person@example.test' }, () => forgotPassword(' person@example.test ')],
    ['/auth/reset-password', payload, () => resetPassword(payload)],
    ['/users/42/reset-password', undefined, () => requestUserPasswordReset('42')],
  ]) {
    api.defaults.adapter = async config => {
      assert.equal(config.url, path); assert.equal(config.method, 'post'); assert.equal(config.withCredentials, true)
      assert.deepEqual(config.data ? JSON.parse(config.data) : undefined, body)
      return { config, status: 200, headers: {}, data: { success: true } }
    }
    await call()
  }
  setAccessToken('fixture-access')
  for (const call of [() => forgotPassword('person@example.test'), () => resetPassword(payload)]) {
    let requests = 0
    api.defaults.adapter = async config => { requests++; throw { config, response: { status: 401, data: { success: false, message: 'Unauthorized', errors: [] } } } }
    await assert.rejects(call, error => error.response.status === 401)
    assert.equal(requests, 1)
  }
  clearAccessToken(); unregister()
  console.log('Recovery API payloads, cookie credentials, Admin target and interceptor exclusions passed.')
} finally { await server.close() }

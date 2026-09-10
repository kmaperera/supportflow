import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { login, refreshSession, changePassword } = await server.ssrLoadModule('/src/api/authApi.js')
  const cases = [
    ['post', '/auth/login', () => login({ email: '', password: '' }), 422],
    ['post', '/auth/refresh', () => refreshSession(), 401],
    ['patch', '/auth/change-password', () => changePassword({}), 401],
  ]
  const adapter = api.defaults.adapter
  for (const [method, path, call, status] of cases) {
    api.defaults.adapter = async config => {
      assert.equal(config.method, method)
      assert.equal(config.url, path)
      assert.equal(config.withCredentials, true)
      assert.equal(new URL(api.getUri(config)).pathname, `/api/v1${path}`)
      return { config, status: 200, headers: {}, data: {
        success: true, data: { user: { id: 1 }, accessToken: 'test-token' },
      } }
    }
    await call()
    if (process.argv.includes('--live')) {
      api.defaults.adapter = adapter
      await assert.rejects(call, error => error.response?.status === status)
    }
  }
  console.log('Auth methods, resolved URLs and credentials passed' +
    (process.argv.includes('--live') ? '; live backend validation/auth rejection checks passed.' : '.'))
} finally {
  await server.close()
}

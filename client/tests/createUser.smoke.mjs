import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { validateCreateUser } from '../src/pages/admin/createUserValidation.js'

const values = { firstName: ' Alex ', lastName: ' Smith ', email: ' Alex@example.com ', role: 'TECHNICIAN', password: ' Abcdef1 ', confirmPassword: ' Abcdef1 ', phone: '', department: '' }
assert.deepEqual(validateCreateUser(values), {})
for (const field of ['firstName', 'lastName', 'email', 'role', 'password', 'confirmPassword']) {
  assert.ok(validateCreateUser({ ...values, [field]: '' })[field])
}
for (const password of ['Abcdef1', 'abcdefgh', 'ABCDEFG1', 'abcdefg1', 'Abcdefgh']) {
  assert.ok(validateCreateUser({ ...values, password, confirmPassword: password }).password)
}
assert.ok(validateCreateUser({ ...values, confirmPassword: 'Different1' }).confirmPassword)
assert.ok(validateCreateUser({ ...values, firstName: 'a'.repeat(101) }).firstName)
assert.ok(validateCreateUser({ ...values, phone: '1'.repeat(31) }).phone)
assert.ok(validateCreateUser({ ...values, department: 'a'.repeat(151) }).department)

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { createUser } = await server.ssrLoadModule('/src/api/userApi.js')
  api.defaults.adapter = async config => {
    assert.equal(config.method, 'post')
    assert.equal(config.url, '/users')
    assert.deepEqual(JSON.parse(config.data), { firstName: 'Alex', lastName: 'Smith', email: 'alex@example.com', role: 'TECHNICIAN', password: values.password })
    return { config, status: 201, headers: {}, data: { success: true, data: { user: { id: 42 } } } }
  }
  assert.deepEqual(await createUser({ ...values, isActive: false, mustChangePassword: false }), { id: 42 })
  const conflict = Object.assign(new Error('Conflict'), { response: { status: 409 } })
  api.defaults.adapter = async () => { throw conflict }
  await assert.rejects(createUser(values), error => error === conflict)
  console.log('Create-user validation, payload allowlist, password preservation, response and conflict propagation passed.')
} finally { await server.close() }

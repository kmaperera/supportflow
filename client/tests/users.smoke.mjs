import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getUsers, updateUserStatus, changeUserRole } = await server.ssrLoadModule('/src/api/userApi.js')
  const pagination = { currentPage: 1, limit: 20, totalRecords: 0, totalPages: 0, hasNext: false, hasPrevious: false }
  api.defaults.adapter = async config => {
    assert.equal(config.method, 'get')
    assert.equal(config.url, '/users')
    assert.deepEqual(config.params, { page: 1, limit: 20, sortBy: 'first_name', order: 'ASC', search: 'Alex', role: 'TECHNICIAN', isActive: 'false' })
    return { config, status: 200, headers: {}, data: { success: true, data: { users: [] }, pagination } }
  }
  assert.deepEqual(await getUsers({ search: ' Alex ', role: 'TECHNICIAN', isActive: 'false', sortBy: 'first_name', order: 'ASC', userId: 99 }), { users: [], pagination })
  api.defaults.adapter = async config => {
    assert.deepEqual(config.params, { page: 1, limit: 20, sortBy: 'created_at', order: 'DESC' })
    return { config, status: 200, headers: {}, data: { success: true, data: { users: [] }, pagination } }
  }
  await getUsers({ search: '', role: '', isActive: '' })
  for (const isActive of [false, true]) {
    api.defaults.adapter = async config => {
      assert.equal(config.method, 'patch')
      assert.equal(config.url, '/users/42/status')
      assert.deepEqual(JSON.parse(config.data), { isActive })
      return { config, status: 200, headers: {}, data: { success: true, data: { user: { id: 42, isActive } } } }
    }
    assert.deepEqual(await updateUserStatus(42, isActive), { id: 42, isActive })
  }
  const failure = Object.assign(new Error('Forbidden'), { response: { status: 403 } })
  for (const role of ['EMPLOYEE', 'TECHNICIAN', 'ADMIN']) {
    api.defaults.adapter = async config => {
      assert.equal(config.method, 'patch')
      assert.equal(config.url, '/users/42/role')
      assert.deepEqual(JSON.parse(config.data), { role })
      return { config, status: 200, headers: {}, data: { success: true, data: { user: { id: 42, role } } } }
    }
    assert.deepEqual(await changeUserRole(42, role), { id: 42, role })
  }
  api.defaults.adapter = async () => { throw failure }
  await assert.rejects(changeUserRole(42, 'ADMIN'), error => error === failure)
  console.log('Role change payloads, server role responses and failure propagation passed.')
  await assert.rejects(updateUserStatus(42, false), error => error === failure)
  console.log('Activation/deactivation PATCH contracts and failure propagation passed.')
  console.log('User list endpoint, server filters/sorts, inactive value, empty parameter omission and pagination contract passed.')
} finally { await server.close() }

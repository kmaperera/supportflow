import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getUsers } = await server.ssrLoadModule('/src/api/userApi.js')
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
  console.log('User list endpoint, server filters/sorts, inactive value, empty parameter omission and pagination contract passed.')
} finally { await server.close() }

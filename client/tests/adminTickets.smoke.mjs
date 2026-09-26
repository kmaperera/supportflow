import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getAdminTickets } = await server.ssrLoadModule('/src/api/ticketApi.js')
  const pagination = { currentPage: 1, limit: 10, totalRecords: 0, totalPages: 0, hasNext: false, hasPrevious: false }
  let expected = { page: 1, limit: 10 }
  api.defaults.adapter = async config => {
    assert.equal(config.url, '/tickets/queue')
    assert.equal(config.method, 'get')
    assert.deepEqual(config.params, expected)
    return { config, status: 200, headers: {}, data: { success: true, data: { tickets: [] }, pagination } }
  }
  assert.deepEqual(await getAdminTickets({ requesterId: 123, status: '', assignment: '' }), { tickets: [], pagination })
  expected = { page: 2, limit: 10, search: 'printer', status: 'CLOSED', categoryId: '9', priorityId: '7', assignment: 'assigned', sortBy: 'priority', order: 'desc' }
  await getAdminTickets({ ...expected, search: ' printer ', userId: 88, sort: 'ignored', attempt: 1 })
  console.log('Admin queue endpoint, all-ticket defaults, filter/sort allowlist and pagination normalization passed.')
} finally { await server.close() }

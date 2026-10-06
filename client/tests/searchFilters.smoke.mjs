import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getMyAssignedTickets, getAdminTickets } = await server.ssrLoadModule('/src/api/ticketApi.js')
  const pagination = { currentPage: 3, limit: 10, totalRecords: 30, totalPages: 3, hasNext: false, hasPrevious: true }
  let seen
  api.defaults.adapter = async config => {
    seen = config
    return { config, status: 200, headers: {}, data: { success: true, data: { tickets: [] }, pagination } }
  }
  const criteria = { page: 3, search: '  printer  room  ', status: 'IN_PROGRESS', categoryId: '2', priorityId: '3', sortBy: 'created_at', order: 'asc' }
  await getMyAssignedTickets({ ...criteria, assignedTo: 999, technicianId: 999, assignment: 'unassigned' })
  assert.equal(seen.url, '/tickets/assigned-to-me')
  assert.deepEqual(seen.params, { ...criteria, search: 'printer  room', limit: 10 })
  await getMyAssignedTickets({ search: '   ', status: '', categoryId: '', priorityId: '' })
  assert.deepEqual(seen.params, { page: 1, limit: 10 })
  await getAdminTickets({ ...criteria, assignedTo: '42', assignment: 'assigned' })
  assert.equal(seen.url, '/tickets/queue')
  assert.deepEqual(seen.params, { ...criteria, search: 'printer  room', limit: 10, assignedTo: '42', assignment: 'assigned' })
  console.log('PASS: scoped assigned search, all-page criteria, whitespace normalization, empty reset and admin technician query.')
} finally { await server.close() }

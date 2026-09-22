import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getAdminDashboardSection: get } = await server.ssrLoadModule('/src/api/dashboardApi.js')
  const summary = Object.fromEntries(['totalTickets', 'activeTickets', 'unassignedTickets', 'openTickets', 'assignedTickets', 'inProgressTickets', 'waitingForUserTickets', 'resolvedTickets', 'closedTickets', 'reopenedTickets'].map(key => [key, 0]))
  api.defaults.adapter = async config => {
    assert.equal(config.method, 'get')
    if (config.url === '/dashboard/admin/summary') {
      assert.equal(config.params, undefined)
      return { config, status: 200, headers: {}, data: { success: true, data: { summary } } }
    }
    assert.equal(config.url, '/dashboard/recent-tickets')
    assert.deepEqual(config.params, { limit: 5 })
    return { config, status: 200, headers: {}, data: { success: true, data: { tickets: [] } } }
  }
  assert.deepEqual(await get('summary'), summary)
  assert.deepEqual(await get('recent'), [])
  summary.activeTickets = -1
  await assert.rejects(get('summary'), /Invalid admin dashboard/)
  api.defaults.adapter = async config => {
    assert.equal(config.url, '/dashboard/technician-workload')
    assert.equal(config.params, undefined)
    return { config, status: 200, headers: {}, data: { success: true, data: { technicians: [{ technicianId: 9, technicianName: 'Support Technician', activeTickets: 3 }] } } }
  }
  assert.equal((await get('workload'))[0].activeTickets, 3)
  await assert.rejects(get('unknown'), /Unknown admin dashboard/)
  console.log('Admin summary/recent endpoints, no ownership parameters, zero-data and malformed counts passed.')
} finally { await server.close() }

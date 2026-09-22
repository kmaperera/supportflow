import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getTechnicianStatisticsSection: get } = await server.ssrLoadModule('/src/api/dashboardApi.js')
  const dimension = { trackedTickets: 0, metTickets: 0, missedTickets: 0, pendingTickets: 0, completedTickets: 0, compliancePercentage: null }
  const cases = [
    ['status', 'status-distribution', 'distribution', [{ status: 'CLOSED', count: 2 }]],
    ['priority', 'priority-distribution', 'distribution', [{ priorityId: 12, priorityName: 'HIGH', count: 2 }]],
    ['response', 'average-first-response-time', 'summary', { respondedTickets: 0, averageFirstResponseMinutes: null }],
    ['resolution', 'average-resolution-time', 'summary', { resolvedTickets: 2, averageResolutionMinutes: 125.75 }],
    ['sla', 'sla-compliance', 'summary', { response: dimension, resolution: dimension }],
  ]
  for (const [kind, path, field, value] of cases) {
    api.defaults.adapter = async config => {
      assert.equal(config.url, `/dashboard/${path}`)
      assert.equal(config.params, undefined)
      return { config, status: 200, headers: {}, data: { success: true, data: { [field]: value } } }
    }
    assert.deepEqual(await get(kind), value)
  }
  api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: { success: true, data: { summary: { respondedTickets: 1, averageFirstResponseMinutes: -1 } } } })
  await assert.rejects(get('response'), /Invalid workload/)
  await assert.rejects(get('admin'), /Unknown statistics/)
  console.log('Technician statistics endpoints, parameter-free ownership, minute units, nullable samples and invalid-response checks passed.')
} finally { await server.close() }

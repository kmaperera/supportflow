import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getAdminAnalyticsSection } = await server.ssrLoadModule('/src/api/dashboardApi.js')
  const { formatAnalyticsMinutes } = await server.ssrLoadModule('/src/pages/admin/analyticsFormatting.js')
  assert.equal(formatAnalyticsMinutes(null), 'Not available')
  assert.equal(formatAnalyticsMinutes(0), '0m')
  assert.equal(formatAnalyticsMinutes(0.5), '<1m')
  assert.equal(formatAnalyticsMinutes(72), '1h 12m')
  for (const period of ['daily', 'monthly']) {
    const trend = [{ [period === 'daily' ? 'date' : 'month']: period === 'daily' ? '2026-09-29' : '2026-09', count: 0 }]
    api.defaults.adapter = async config => {
      assert.equal(config.url, '/dashboard/ticket-trend')
      assert.deepEqual(config.params, { period })
      return { config, status: 200, headers: {}, data: { success: true, data: { period, trend } } }
    }
    assert.deepEqual(await getAdminAnalyticsSection('trend', { period }), trend)
  }
  await assert.rejects(getAdminAnalyticsSection('trend', { period: 'weekly' }))
  const samples = {
    category: ['category-distribution', { distribution: [{ categoryId: 3, categoryName: 'Network', count: 4 }] }],
    satisfaction: ['satisfaction-summary', { summary: { totalRatings: 0, satisfiedRatings: 0, averageRating: null, satisfactionPercentage: null } }],
    response: ['average-first-response-time', { summary: { respondedTickets: 3, averageFirstResponseMinutes: 72 } }],
    resolution: ['average-resolution-time', { summary: { resolvedTickets: 0, averageResolutionMinutes: null } }],
    status: ['status-distribution', { distribution: [{ status: 'OPEN', count: 2 }] }],
    priority: ['priority-distribution', { distribution: [{ priorityName: 'LOW', count: 2 }] }],
    workload: ['technician-workload', { technicians: [{ technicianId: 2, technicianName: 'Alex', activeTickets: 2 }] }],
  }
  for (const [section, [path, data]] of Object.entries(samples)) {
    api.defaults.adapter = async config => {
      assert.equal(config.url, `/dashboard/${path}`)
      assert.equal(config.params, undefined)
      return { config, status: 200, headers: {}, data: { success: true, data } }
    }
    assert.deepEqual(await getAdminAnalyticsSection(section), Object.values(data)[0])
  }
  api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: { success: true, data: { distribution: [{ categoryName: 'Bad', count: -1 }] } } })
  await assert.rejects(getAdminAnalyticsSection('category'))
  console.log('Analytics endpoints, period parameters, zero samples, validation and minute formatting passed.')
} finally { await server.close() }

import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { validateReportDates } from '../src/pages/admin/reportValidation.js'

assert.deepEqual(validateReportDates('tickets', {}), {})
assert.equal(Object.keys(validateReportDates('date-range', {})).length, 2)
assert.ok(validateReportDates('tickets', { startDate: '2026-02-30' }).startDate)
assert.ok(validateReportDates('tickets', { startDate: '2026-03-02', endDate: '2026-03-01' }).endDate)
assert.ok(validateReportDates('tickets', { endDate: '9999-12-31' }).endDate)
assert.deepEqual(validateReportDates('date-range', { startDate: '2024-02-29', endDate: '2024-02-29' }), {})
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getReport, reportTypes, buildReportParams } = await server.ssrLoadModule('/src/api/reportApi.js')
  const values = { startDate: '2026-01-01', endDate: '2026-01-31', status: 'OPEN', categoryId: '17', priorityId: '9', technicianId: '35', search: ' help ', sortBy: 'createdAt', sortOrder: 'desc', userId: 999 }
  for (const [type, contract] of Object.entries(reportTypes)) {
    const expected = Object.fromEntries(contract.fields.map(field => [field, typeof values[field] === 'string' ? values[field].trim() : values[field]]))
    if (type === 'tickets') Object.assign(expected, { page: 2, limit: 25 })
    const report = type === 'sla' ? { responseSla: {}, resolutionSla: {} } : { [contract.rows]: [], ...(type === 'tickets' ? { pagination: { page: 2, limit: 25, totalPages: 0, totalItems: 0 } } : {}) }
    api.defaults.adapter = async config => {
      assert.equal(config.method, 'get')
      assert.equal(config.url, `/reports/${type}`)
      assert.deepEqual(config.params, expected)
      return { config, status: 200, headers: {}, data: { success: true, data: { report } } }
    }
    assert.deepEqual(await getReport(type, values, { page: 2 }), report)
  }
  assert.deepEqual(buildReportParams('technician-performance', { technicianId: '35', startDate: '' }), {})
  assert.deepEqual(buildReportParams('tickets', { search: ' ', status: '' }), { page: 1, limit: 25 })
  await assert.rejects(getReport('invented', {}))
  api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: { success: true, data: { report: {} } } })
  await assert.rejects(getReport('tickets', {}))
  console.log('Seven report endpoint contracts, filter allowlists, pagination, empty results and UTC date validation passed.')
} finally { await server.close() }

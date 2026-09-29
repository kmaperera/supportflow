import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { exportReport, reportExportFilename, reportExportError } = await server.ssrLoadModule('/src/api/reportExportApi.js')
  for (const type of ['tickets', 'date-range', 'technician-performance', 'sla', 'categories', 'priorities', 'statuses']) {
    for (const format of type === 'tickets' ? ['csv', 'pdf'] : ['csv']) {
      const blob = new Blob([format === 'pdf' ? '%PDF-1.7 test' : '\uFEFF"Ticket"\r\n'], { type: format === 'pdf' ? 'application/pdf' : 'text/csv;charset=utf-8' })
      api.defaults.adapter = async config => {
        assert.equal(config.url, `/reports/${type}/export/${format}`)
        assert.equal(config.responseType, 'blob')
        assert.deepEqual(config.params, { startDate: '2026-09-01', endDate: '2026-09-29' })
        return { config, status: 200, headers: { 'content-type': blob.type, 'content-disposition': `attachment; filename="server-report.${format}"` }, data: blob }
      }
      const file = await exportReport(type, format, { startDate: '2026-09-01', endDate: '2026-09-29', page: 5, limit: 25, userId: 1 })
      assert.equal(file.blob, blob)
      assert.equal(file.filename, `server-report.${format}`)
    }
  }
  await assert.rejects(exportReport('sla', 'pdf', {}))
  assert.equal(reportExportFilename("attachment; filename*=UTF-8''support%20report.csv", 'tickets', 'csv'), 'support report.csv')
  assert.match(reportExportFilename('attachment; filename="../bad.csv"', 'tickets', 'csv'), /^tickets-report-\d{4}-\d{2}-\d{2}\.csv$/)
  for (const data of [new Blob([]), new Blob(['{"error":true}'], { type: 'application/json' }), new Blob(['bad PDF'], { type: 'application/pdf' })]) {
    api.defaults.adapter = async config => ({ config, status: 200, headers: { 'content-type': data.type }, data })
    await assert.rejects(exportReport('tickets', 'pdf', {}))
  }
  assert.match(await reportExportError({ response: { status: 422, data: new Blob(['{"success":false,"message":"unsafe"}']) } }), /check the report criteria/)
  assert.equal(await reportExportError({ response: { status: 500, data: new Blob(['internal stack']) } }), 'Unable to export report. Please try again.')
  assert.match(await reportExportError({ response: { status: 403, data: new Blob(['{}']) } }), /permission/)
  console.log('CSV/PDF endpoints, full-report parameters, blobs, filenames and safe blob errors passed.')
} finally { await server.close() }

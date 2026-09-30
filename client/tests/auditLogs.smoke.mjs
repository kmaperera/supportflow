import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getAuditLogs, auditParams, safeAuditMetadata } = await server.ssrLoadModule('/src/api/auditApi.js')
  assert.deepEqual(auditParams({ search: ' demo ', action: '', role: 'ADMIN', sortBy: 'secret' }, 2), { page: 2, limit: 25, search: 'demo' })
  assert.deepEqual(safeAuditMetadata({ isDemo: true, schemaVersion: 1, password: 'secret', nested: { token: 'secret' } }), { isDemo: true, schemaVersion: 1 })
  const pagination = { page: 2, limit: 25, total: 26, totalPages: 2, hasNextPage: false, hasPreviousPage: true }
  api.defaults.adapter = async config => {
    assert.equal(config.method, 'get')
    assert.equal(config.url, '/audit-logs')
    assert.deepEqual(config.params, { page: 2, limit: 25, action: 'SYSTEM_INITIALIZED', startDate: '2026-09-01', endDate: '2026-09-30' })
    return { config, status: 200, headers: {}, data: { success: true, data: { logs: [{ id: '7', action: 'SYSTEM_INITIALIZED', actor: null, createdAt: '2026-09-30T00:00:00.000Z', metadata: { isDemo: true, refreshToken: 'hidden' } }], pagination } } }
  }
  const result = await getAuditLogs({ action: 'SYSTEM_INITIALIZED', startDate: '2026-09-01', endDate: '2026-09-30' }, { page: 2 })
  assert.deepEqual(result.pagination, pagination)
  assert.deepEqual(result.logs[0].metadata, { isDemo: true })
  api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: { success: true, data: { logs: [], pagination: { ...pagination, page: 1, total: 0, totalPages: 0, hasPreviousPage: false } } } })
  assert.equal((await getAuditLogs({})).logs.length, 0)
  console.log('Audit GET contract, filter allowlist, date preservation, metadata safety and pagination passed.')
} finally { await server.close() }

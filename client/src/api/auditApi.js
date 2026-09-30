import api from './axios'

export const auditFilterFields = ['search', 'action', 'actorUserId', 'entityType', 'entityId', 'startDate', 'endDate']
export function auditParams(filters = {}, page = 1) {
  const params = { page, limit: 25 }
  for (const field of auditFilterFields) {
    const value = filters[field]?.trim()
    if (value) params[field] = value
  }
  return params
}
export function safeAuditMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const safe = {}
  if (typeof metadata.isDemo === 'boolean') safe.isDemo = metadata.isDemo
  if (Number.isSafeInteger(metadata.schemaVersion) && metadata.schemaVersion > 0) safe.schemaVersion = metadata.schemaVersion
  return Object.keys(safe).length ? safe : null
}
export async function getAuditLogs(filters, { page = 1, signal } = {}) {
  const { data } = await api.get('/audit-logs', { params: auditParams(filters, page), signal })
  const result = data?.data
  const pagination = result?.pagination
  if (data?.success !== true || !Array.isArray(result?.logs) || !pagination ||
      !['page', 'limit', 'total', 'totalPages'].every(field => Number.isSafeInteger(pagination[field]) && pagination[field] >= (field === 'page' || field === 'limit' ? 1 : 0)) ||
      !['hasNextPage', 'hasPreviousPage'].every(field => typeof pagination[field] === 'boolean') ||
      result.logs.some(row => !row?.id || typeof row.action !== 'string' || typeof row.createdAt !== 'string')) throw new Error('Invalid audit response')
  return { ...result, logs: result.logs.map(row => ({ ...row, metadata: safeAuditMetadata(row.metadata) })) }
}

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
  for (const key of ['role', 'previousRole', 'newRole']) {
    if (['ADMIN', 'EMPLOYEE', 'TECHNICIAN'].includes(metadata[key])) safe[key] = metadata[key];
  }
  for (const key of ['status', 'previousStatus', 'newStatus']) {
    if (['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(metadata[key])) safe[key] = metadata[key];
  }
  for (const key of ['isActive', 'previousActive', 'newActive']) {
    if (typeof metadata[key] === 'boolean') safe[key] = metadata[key];
  }
  if (typeof metadata.name === 'string' && Array.from(metadata.name).length <= 100) safe.name = metadata.name;
  for (const key of ['categoryId', 'newTechnicianId', 'previousTechnicianId', 'newAssignmentId', 'previousAssignmentId', 'previousPriorityId', 'newPriorityId']) {
    if (typeof metadata[key] === 'string' && /^[1-9]\d{0,19}$/.test(metadata[key]) && BigInt(metadata[key]) <= 18446744073709551615n) safe[key] = metadata[key];
  }
  for (const key of ['previousResponseMinutes', 'newResponseMinutes', 'previousResolutionMinutes', 'newResolutionMinutes']) {
    if (Number.isInteger(metadata[key]) && metadata[key] > 0 && metadata[key] <= 4294967295) safe[key] = metadata[key];
  }
  const fields = new Set(['name', 'description', 'title', 'content', 'categoryId', 'responseTimeMinutes', 'resolutionTimeMinutes']);
  if (Array.isArray(metadata.changedFields) && metadata.changedFields.length <= fields.size && metadata.changedFields.every(field => fields.has(field))) safe.changedFields = [...new Set(metadata.changedFields)];
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

import api from './axios'

const base = '/sla/policies'
const valid = policy => policy?.id && typeof policy.priorityName === 'string' && typeof policy.isActive === 'boolean' && ['responseTimeMinutes', 'resolutionTimeMinutes'].every(key => Number.isInteger(policy[key]) && policy[key] > 0)
export async function getSlaPolicies({ signal } = {}) {
  const { data } = await api.get(base, { signal })
  if (data?.success !== true || !Array.isArray(data.data?.policies) || !data.data.policies.every(valid)) throw new Error('Invalid SLA policies response')
  return data.data.policies
}
export async function updateSlaPolicy(id, { responseTimeMinutes, resolutionTimeMinutes }) {
  const { data } = await api.patch(`${base}/${encodeURIComponent(id)}`, { responseTimeMinutes, resolutionTimeMinutes })
  if (data?.success !== true || !valid(data.data?.policy)) throw new Error('Invalid SLA policy response')
  return data.data.policy
}

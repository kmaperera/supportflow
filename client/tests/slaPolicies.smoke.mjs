import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { validateSlaDurations, formatPolicyMinutes } from '../src/pages/admin/slaPolicyForm.js'
assert.equal(formatPolicyMinutes(30), '30m')
assert.equal(formatPolicyMinutes(60), '1h')
assert.equal(formatPolicyMinutes(90), '1h 30m')
assert.deepEqual(validateSlaDurations({ responseTimeMinutes: '60', resolutionTimeMinutes: '60' }), {})
for (const value of ['', '0', '-1', '1.5', '4294967296']) assert.ok(validateSlaDurations({ responseTimeMinutes: value, resolutionTimeMinutes: '60' }).responseTimeMinutes)
assert.ok(validateSlaDurations({ responseTimeMinutes: '61', resolutionTimeMinutes: '60' }).resolutionTimeMinutes)
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getSlaPolicies, updateSlaPolicy } = await server.ssrLoadModule('/src/api/slaPolicyApi.js')
  const policy = { id: 5, priorityName: 'HIGH', responseTimeMinutes: 60, resolutionTimeMinutes: 480, isActive: false }
  api.defaults.adapter = async config => {
    assert.equal(config.url, '/sla/policies')
    return { config, status: 200, headers: {}, data: { success: true, data: { policies: [policy] } } }
  }
  assert.deepEqual(await getSlaPolicies(), [policy])
  api.defaults.adapter = async config => {
    assert.equal(config.method, 'patch'); assert.equal(config.url, '/sla/policies/5')
    assert.deepEqual(JSON.parse(config.data), { responseTimeMinutes: 60, resolutionTimeMinutes: 480 })
    return { config, status: 200, headers: {}, data: { success: true, data: { policy } } }
  }
  assert.deepEqual(await updateSlaPolicy(5, { ...policy, priorityId: 9 }), policy)
  console.log('SLA units, duration validation, list/update contracts and payload allowlist passed.')
} finally { await server.close() }

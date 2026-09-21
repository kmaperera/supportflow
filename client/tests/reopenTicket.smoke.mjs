import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { reopenTicket } = await server.ssrLoadModule('/src/api/ticketApi.js')
  const ticket = { id: 81, status: 'REOPENED', resolvedAt: '2026-09-21T01:00:00Z' }
  api.defaults.adapter = async config => {
    assert.equal(config.method, 'patch')
    assert.equal(config.url, '/tickets/81/reopen')
    assert.equal(config.data, undefined)
    assert.equal(config.params, undefined)
    return { config, status: 200, headers: {}, data: { success: true, data: { ticket } } }
  }
  assert.deepEqual(await reopenTicket('81'), ticket)
  api.defaults.adapter = async () => { throw { response: { status: 409 } } }
  await assert.rejects(() => reopenTicket('81'), error => error.response.status === 409)
  api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: {} })
  await assert.rejects(() => reopenTicket('81'), /Invalid ticket reopen response/)
  console.log('Reopen endpoint, empty payload, returned ticket and conflict propagation passed.')
} finally { await server.close() }

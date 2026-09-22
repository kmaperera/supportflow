import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { resolveTicket } = await server.ssrLoadModule('/src/api/ticketApi.js')
  const { default: Control } = await server.ssrLoadModule('/src/pages/technician/TicketResolveControl.jsx')
  const { canResolveTicket, validateResolutionSummary } = await server.ssrLoadModule('/src/pages/technician/ticketResolution.js')
  for (const status of ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED', 'RESOLVED', 'CLOSED']) {
    for (const assignedTo of [null, 7, 8]) {
      const ticket = { id: 42, assignedTo, status }
      const eligible = assignedTo === 7 && ['IN_PROGRESS', 'WAITING_FOR_USER'].includes(status)
      assert.equal(canResolveTicket(ticket, '7'), eligible)
      const html = renderToString(React.createElement(Control, { ticket, userId: '7', summary: '', pending: true }))
      assert.equal(html.includes('Resolution summary'), eligible)
      if (eligible) assert.match(html, /type="submit" disabled=""/)
    }
  }
  assert.ok(validateResolutionSummary('         '))
  assert.ok(validateResolutionSummary('123456789'))
  assert.equal(validateResolutionSummary('😀'.repeat(10)), null)
  assert.equal(validateResolutionSummary('x'.repeat(5000)), null)
  assert.ok(validateResolutionSummary('x'.repeat(5001)))
  const ticket = { id: 42, status: 'RESOLVED', resolvedAt: '2026-09-22T00:00:00Z', resolutionSummary: 'Issue fixed successfully' }
  api.defaults.adapter = async config => {
    assert.equal(config.method, 'patch')
    assert.equal(config.url, '/tickets/42/resolve')
    assert.deepEqual(JSON.parse(config.data), { resolutionSummary: 'Issue fixed successfully' })
    return { config, status: 200, headers: {}, data: { success: true, data: { ticket } } }
  }
  assert.deepEqual(await resolveTicket(42, ' Issue fixed successfully '), ticket)
  api.defaults.adapter = async () => { throw Object.assign(new Error('stale'), { response: { status: 409 } }) }
  await assert.rejects(resolveTicket(42, 'Issue fixed successfully'), error => error.response.status === 409)
  console.log('Resolve eligibility, summary boundaries, disabled control, exact payload and server-error propagation passed.')
} finally { await server.close() }

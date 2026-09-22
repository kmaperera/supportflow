import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { updateTicketPriority, getTicketPriorities } = await server.ssrLoadModule('/src/api/ticketApi.js')
  const { default: Control } = await server.ssrLoadModule('/src/pages/technician/TicketPriorityControl.jsx')
  const { canManagePriority } = await server.ssrLoadModule('/src/pages/technician/ticketPriorityEligibility.js')
  const ticket = { id: 81, assignedTo: 7, status: 'IN_PROGRESS', priority: { id: 93, name: 'HIGH' }, responseDueAt: '2026-09-22T08:00:00Z' }
  api.defaults.adapter = async config => {
    if (config.method === 'get') {
      assert.equal(config.url, '/tickets/priorities')
      return { config, status: 200, headers: {}, data: { success: true, data: { priorities: [{ id: 93, name: 'HIGH' }] } } }
    }
    assert.equal(config.method, 'patch')
    assert.equal(config.url, '/tickets/81/priority')
    assert.deepEqual(JSON.parse(config.data), { priorityId: '93' })
    assert.equal(config.params, undefined)
    return { config, status: 200, headers: {}, data: { success: true, data: { ticket } } }
  }
  assert.deepEqual(await updateTicketPriority(81, '93'), ticket)
  assert.deepEqual(await getTicketPriorities(), [{ id: 93, name: 'HIGH' }])
  for (const status of ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED']) assert.equal(canManagePriority({ ...ticket, status }, '7'), true)
  for (const status of ['RESOLVED', 'CLOSED']) assert.equal(canManagePriority({ ...ticket, status }, 7), false)
  for (const assignedTo of [null, 99]) assert.equal(canManagePriority({ ...ticket, assignedTo }, 7), false)
  const render = ticket => renderToString(React.createElement(Control, { ticket, userId: 7, pending: false, onUpdate() {} }))
  assert.match(render(ticket), /Loading priority options/)
  assert.match(render(ticket), /High/)
  assert.ok(!render({ ...ticket, status: 'CLOSED' }).includes('Loading priority options'))
  assert.ok(!render({ ...ticket, assignedTo: null }).includes('<select'))
  for (const status of [400, 403, 404, 409, 422, 500]) {
    api.defaults.adapter = async () => { throw { response: { status } } }
    await assert.rejects(() => updateTicketPriority(81, 93), error => error.response.status === status)
  }
  console.log('Priority endpoint/body, lookup IDs, response SLA fields, ownership/lifecycle gating and errors passed.')
} finally { await server.close() }

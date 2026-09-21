import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { selfAssignTicket } = await server.ssrLoadModule('/src/api/ticketApi.js')
  const { SelfAssignAction, UnassignedTicketsList } = await server.ssrLoadModule('/src/pages/technician/UnassignedTicketsPage.jsx')
  const ticket = { id: 81, ticketNumber: 'SUP-81', title: 'Printer', assignedTo: null, status: 'OPEN' }
  const assigned = { ...ticket, assignedTo: 7, status: 'ASSIGNED' }
  api.defaults.adapter = async config => {
    assert.equal(config.method, 'post')
    assert.equal(config.url, '/tickets/81/self-assign')
    assert.equal(config.data, undefined)
    assert.equal(config.params, undefined)
    return { config, status: 200, headers: {}, data: { success: true, data: { ticket: assigned } } }
  }
  assert.deepEqual(await selfAssignTicket(81), assigned)
  const action = (ticket, pending = false) => React.createElement(SelfAssignAction, { ticket, pending, onAssign() {} })
  assert.ok(!renderToString(action(ticket)).includes('disabled=""'))
  assert.match(renderToString(action(ticket, true)), /disabled=""/)
  assert.match(renderToString(action(ticket, true)), /Assigning\.\.\./)
  for (const status of ['ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED', 'REOPENED']) assert.match(renderToString(action({ ...ticket, status })), /disabled=""/)
  assert.match(renderToString(action({ ...ticket, assignedTo: 9 })), /disabled=""/)
  const html = renderToString(React.createElement(MemoryRouter, null, React.createElement(UnassignedTicketsList, { tickets: [ticket], totalRecords: 1, renderAction: ticket => action(ticket) })))
  const link = html.match(/<a\b[^>]*>([\s\S]*?)<\/a>/)[1]
  assert.ok(!link.includes('<button'))
  assert.ok(html.indexOf('<button') > html.indexOf('</a>'))
  for (const status of [400, 401, 403, 404, 409, 422, 500]) {
    api.defaults.adapter = async () => { throw { response: { status, data: { success: false, message: 'private details' } } } }
    await assert.rejects(() => selfAssignTicket(81), error => error.response.status === status)
  }
  api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: { success: true, data: {} } })
  await assert.rejects(() => selfAssignTicket(81), /Invalid self-assignment response/)
  console.log('Self-assignment method/body/response, error propagation, eligibility, pending state and sibling action semantics passed.')
} finally { await server.close() }

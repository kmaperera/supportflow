import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getTicketById, getTicketStatusHistory } = await server.ssrLoadModule('/src/api/ticketApi.js')
  const { TechnicianTicketDetailsContent } = await server.ssrLoadModule('/src/pages/technician/TechnicianTicketDetailsPage.jsx')
  const { StatusHistoryList } = await server.ssrLoadModule('/src/pages/employee/TicketStatusTimeline.jsx')
  const ticket = { id: 81, ticketNumber: 'SUP-81', title: 'Printer', description: '<script>unsafe</script>\nSecond line', assignedTo: 7, status: 'ASSIGNED', creator: { firstName: 'Alex', lastName: 'Lee', email: 'private@example.test' }, assignee: { firstName: 'Sam', lastName: 'Tech' }, category: { name: 'Hardware' }, priority: { name: 'HIGH' }, createdAt: '2026-09-22T00:00:00Z', updatedAt: '2026-09-22T01:00:00Z', internalNotes: 'private-note', responseDueAt: 'private-deadline' }
  const history = [{ id: 1, fromStatus: 'OPEN', toStatus: 'ASSIGNED', changedAt: ticket.updatedAt, changedBy: { firstName: 'Sam', lastName: 'Tech', email: 'private@example.test' } }]
  api.defaults.adapter = async config => {
    assert.equal(config.method, 'get')
    assert.equal(config.params, undefined)
    assert.ok(['/tickets/81', '/tickets/81/status-history'].includes(config.url))
    return { config, status: 200, headers: {}, data: { success: true, data: config.url.endsWith('/status-history') ? { history } : { ticket } } }
  }
  assert.deepEqual(await getTicketById(81), ticket)
  assert.deepEqual(await getTicketStatusHistory(81), history)
  const render = ticket => renderToString(React.createElement(TechnicianTicketDetailsContent, { ticket, userId: 7 }))
  const html = render(ticket)
  for (const text of ['SUP-81', 'Assigned to you', 'Alex Lee', 'Sam Tech', 'Hardware', 'High', '&lt;script&gt;', 'Second line']) assert.ok(html.includes(text))
  for (const text of ['<script>', 'private@example.test', 'private-note', 'private-deadline', '<button']) assert.ok(!html.includes(text))
  assert.match(render({ ...ticket, assignedTo: null, assignee: null }), /Unassigned/)
  const timeline = renderToString(React.createElement(StatusHistoryList, { history })).replaceAll('<!-- -->', '')
  assert.match(timeline, /Open/)
  assert.match(timeline, /Assigned/)
  assert.match(timeline, /Sam Tech/)
  assert.ok(!timeline.includes('private@example.test'))
  console.log('Technician detail/history contracts, assignment labels, safe description, requester privacy and reused timeline passed.')
} finally { await server.close() }

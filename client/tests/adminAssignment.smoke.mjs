import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: Assignment } = await server.ssrLoadModule('/src/pages/admin/AdminTicketAssignment.jsx')
  const render = ticket => renderToStaticMarkup(React.createElement(Assignment, { ticket, refresh: async () => {} }))
  assert.match(render({ id: 1, assignedTo: null, assignee: null, status: 'OPEN' }), /Assign technician/)
  const assigned = render({ id: 1, assignedTo: 4, assignee: { firstName: 'Jane', lastName: 'Tech' }, status: 'ASSIGNED' })
  assert.match(assigned, /Reassign/); assert.match(assigned, /Jane Tech/); assert.doesNotMatch(assigned, /Assign technician/)
  assert.doesNotMatch(render({ id: 1, assignedTo: null, status: 'CLOSED' }), /Assign technician/)
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { assignTicket } = await server.ssrLoadModule('/src/api/ticketApi.js')
  api.defaults.adapter = async config => {
    assert.equal(config.url, '/tickets/1/assign'); assert.equal(config.method, 'patch')
    assert.deepEqual(JSON.parse(config.data), { technicianId: 4 })
    return { config, status: 200, headers: {}, data: { success: true, data: { ticket: { id: 1, assignedTo: 4 } } } }
  }
  assert.equal((await assignTicket(1, 4)).assignedTo, 4)
  console.log('Assignment visibility for unassigned/assigned/closed tickets and mutation contract passed.')
} finally { await server.close() }

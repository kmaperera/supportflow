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
  for (const status of ['ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED']) {
    assert.match(render({ id: 1, assignedTo: 4, assignment: { id: 10 }, status }), />Unassign<\/button>/)
  }
  for (const status of ['OPEN', 'RESOLVED', 'CLOSED']) {
    assert.doesNotMatch(render({ id: 1, assignedTo: 4, assignment: { id: 10 }, status }), />Unassign<\/button>/)
  }
  assert.doesNotMatch(render({ id: 1, assignedTo: null, assignment: null, status: 'OPEN' }), />Unassign<\/button>/)
  assert.doesNotMatch(render({ id: 1, assignedTo: 4, status: 'ASSIGNED' }), />Unassign<\/button>/)
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { assignTicket, unassignTicket } = await server.ssrLoadModule('/src/api/ticketApi.js')
  api.defaults.adapter = async config => {
    assert.equal(config.url, '/tickets/1/assign'); assert.equal(config.method, 'patch')
    assert.deepEqual(JSON.parse(config.data), { technicianId: 4 })
    return { config, status: 200, headers: {}, data: { success: true, data: { ticket: { id: 1, assignedTo: 4 } } } }
  }
  assert.equal((await assignTicket(1, 4)).assignedTo, 4)
  api.defaults.adapter = async config => {
    assert.equal(config.url, '/tickets/1/unassign'); assert.equal(config.method, 'patch')
    assert.deepEqual(JSON.parse(config.data), { expectedAssignmentId: '9007199254740993' })
    return { config, status: 200, headers: {}, data: { success: true, data: { ticket: { id: 1, assignedTo: null, status: 'OPEN' } } } }
  }
  assert.equal((await unassignTicket(1, '9007199254740993')).assignedTo, null)
  const conflict = Object.assign(new Error('Conflict'), { response: { status: 409 } })
  api.defaults.adapter = async () => { throw conflict }
  await assert.rejects(unassignTicket(1, 10), error => error === conflict)
  console.log('Unassign eligibility, exact assignment-token payload and conflict propagation passed.')
  console.log('Assignment visibility for unassigned/assigned/closed tickets and mutation contract passed.')
} finally { await server.close() }

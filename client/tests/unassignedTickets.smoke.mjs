import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getUnassignedTickets } = await server.ssrLoadModule('/src/api/ticketApi.js')
  const { UnassignedTicketsList } = await server.ssrLoadModule('/src/pages/technician/UnassignedTicketsPage.jsx')
  const tickets = [{ id: 81, ticketNumber: 'SUP-81', title: '<script>Printer</script>', status: 'REOPENED', creator: { firstName: 'Alex', lastName: 'Lee', email: 'private@example.test' }, category: { name: 'Hardware' }, priority: { name: 'CRITICAL' }, createdAt: '2026-09-22T01:00:00Z' }]
  const pagination = { currentPage: 2, limit: 10, totalRecords: 11, totalPages: 2, hasNext: false, hasPrevious: true }
  api.defaults.adapter = async config => {
    assert.equal(config.method, 'get')
    assert.equal(config.url, '/tickets/queue')
    assert.deepEqual(config.params, { assignment: 'unassigned', page: 2, limit: 10 })
    return { config, status: 200, headers: {}, data: { success: true, data: { tickets }, pagination } }
  }
  assert.deepEqual(await getUnassignedTickets({ page: 2, technicianId: 99, requesterId: 99, assignment: 'mine' }), { tickets, pagination })
  api.defaults.adapter = async config => {
    assert.deepEqual(config.params, { assignment: 'unassigned', page: 1, limit: 10, search: 'printer', status: 'REOPENED', categoryId: '73', priorityId: '91', sortBy: 'priority', order: 'desc' })
    return { config, status: 200, headers: {}, data: { success: true, data: { tickets }, pagination } }
  }
  await getUnassignedTickets({ search: ' printer ', status: 'REOPENED', categoryId: '73', priorityId: '91', sortBy: 'priority', order: 'desc', assignment: 'assigned', assignedTo: 99 })
  api.defaults.adapter = async config => {
    assert.deepEqual(config.params, { assignment: 'unassigned', page: 1, limit: 10 })
    return { config, status: 200, headers: {}, data: { success: true, data: { tickets }, pagination } }
  }
  await getUnassignedTickets({ search: '  ', status: '', categoryId: '', priorityId: '', sortBy: '', order: '' })
  const render = (tickets, totalRecords) => renderToString(React.createElement(MemoryRouter, null, React.createElement(UnassignedTicketsList, { tickets, totalRecords }))).replaceAll('<!-- -->', '')
  const html = render(tickets, 11)
  for (const text of ['SUP-81', 'Alex Lee', 'Hardware', 'Critical', 'Reopened', '&lt;script&gt;', '/technician/tickets/81']) assert.ok(html.includes(text))
  assert.ok(!html.includes('private@example.test'))
  assert.ok(!html.includes('<script>'))
  assert.ok(!html.includes('<button'))
  assert.match(render([], 0), /There are no unassigned tickets right now/)
  assert.match(render([], 0), /href="\/technician\/tickets\/assigned"/)
  assert.match(render([], 11), /No unassigned tickets on this page/)
  const filteredEmpty = renderToString(React.createElement(MemoryRouter, null, React.createElement(UnassignedTicketsList, { tickets: [], totalRecords: 0, filtered: true, onReset() {} })))
  assert.match(filteredEmpty, /No unassigned tickets match your current search or filters/)
  assert.match(filteredEmpty, /Clear filters/)
  assert.ok(!filteredEmpty.includes('There are no unassigned tickets right now'))
  api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: { success: true, data: { tickets }, pagination: { ...pagination, totalRecords: -1 } } })
  await assert.rejects(getUnassignedTickets, /Invalid assigned ticket list response/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(() => getUnassignedTickets({ signal: controller.signal }), error => error.code === 'ERR_CANCELED')
  console.log('Unassigned queue contract, fixed assignment scope, pagination, returned status, private-field exclusion, empty states and cancellation passed.')
} finally { await server.close() }

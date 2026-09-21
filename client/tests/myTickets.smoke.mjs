import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getMyTickets } = await server.ssrLoadModule('/src/api/ticketApi.js')
  const { MyTicketsList } = await server.ssrLoadModule('/src/pages/employee/MyTicketsPage.jsx')
  const tickets = [{ id: 81, ticketNumber: 'SUP-2026-000081', title: 'Network unavailable', category: { name: 'Network' }, priority: { name: 'HIGH' }, status: 'WAITING_FOR_USER', createdAt: '2026-09-21T01:00:00Z' }]
  const pagination = { currentPage: 2, limit: 10, totalRecords: 11, totalPages: 2, hasNext: false, hasPrevious: true }
  api.defaults.adapter = async config => {
    assert.equal(config.method, 'get')
    assert.equal(config.url, '/tickets/my')
    assert.deepEqual(config.params, { page: 2, limit: 10 })
    return { config, status: 200, headers: {}, data: { success: true, data: { tickets }, pagination } }
  }
  assert.deepEqual(await getMyTickets({ page: 2, userId: 999 }), { tickets, pagination })
  api.defaults.adapter = async config => {
    assert.deepEqual(config.params, { page: 1, limit: 10, search: 'network', status: 'REOPENED', categoryId: '73', priorityId: '91', sortBy: 'updated_at', order: 'desc' })
    return { config, status: 200, headers: {}, data: { success: true, data: { tickets }, pagination } }
  }
  await getMyTickets({ search: ' network ', status: 'REOPENED', categoryId: '73', priorityId: '91', sortBy: 'updated_at', order: 'desc', employeeId: 999 })
  api.defaults.adapter = async config => {
    assert.deepEqual(config.params, { page: 1, limit: 10 })
    return { config, status: 200, headers: {}, data: { success: true, data: { tickets }, pagination } }
  }
  await getMyTickets({ search: '  ', status: '', categoryId: '', priorityId: '' })
  const render = (tickets, totalRecords) => renderToString(React.createElement(MemoryRouter, null, React.createElement(MyTicketsList, { tickets, totalRecords })))
  const html = render(tickets, 11)
  for (const text of ['SUP-2026-000081', 'Network unavailable', 'High', 'Waiting for User']) assert.ok(html.includes(text))
  assert.ok(html.includes('/employee/tickets/81'))
  assert.match(render([], 0), /support tickets yet/)
  assert.match(render([], 0), /href="\/employee\/tickets\/new"/)
  assert.match(render([], 11), /No tickets on this page/)
  api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: { success: true } })
  await assert.rejects(() => getMyTickets(), /Invalid ticket list response/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(() => getMyTickets({ signal: controller.signal }), error => error.code === 'ERR_CANCELED')
  console.log('My Tickets API contract, pagination, cards, empty state and cancellation passed.')
} finally { await server.close() }

import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getMyAssignedTickets } = await server.ssrLoadModule('/src/api/ticketApi.js')
  const { AssignedTicketsList } = await server.ssrLoadModule('/src/pages/technician/MyAssignedTicketsPage.jsx')
  const tickets = [{ id: 81, ticketNumber: 'SUP-2026-000081', title: '<script>Network issue</script>', creator: { firstName: 'Malith', lastName: 'Perera', email: 'private@example.test' }, category: { name: 'Network' }, priority: { name: 'HIGH' }, status: 'IN_PROGRESS', createdAt: '2026-09-21T01:00:00Z', slaResponseBreached: true }]
  const pagination = { currentPage: 2, limit: 10, totalRecords: 11, totalPages: 2, hasNext: false, hasPrevious: true }
  api.defaults.adapter = async config => {
    assert.equal(config.method, 'get')
    assert.equal(config.url, '/tickets/assigned-to-me')
    assert.deepEqual(config.params, { page: 2, limit: 10 })
    return { config, status: 200, headers: {}, data: { success: true, data: { tickets }, pagination } }
  }
  assert.deepEqual(await getMyAssignedTickets({ page: 2, technicianId: 999, assignedTo: 999, userId: 999 }), { tickets, pagination })
  const render = (tickets, totalRecords) => renderToString(React.createElement(MemoryRouter, null, React.createElement(AssignedTicketsList, { tickets, totalRecords }))).replaceAll('<!-- -->', '')
  const html = render(tickets, 11)
  for (const text of ['SUP-2026-000081', 'Malith Perera', 'High', 'In Progress', 'Network', '&lt;script&gt;']) assert.ok(html.includes(text))
  for (const text of ['private@example.test', '<script>', 'breach', 'Assign to me']) assert.ok(!html.includes(text))
  const card = html.match(/<a\b[^>]*href="\/technician\/tickets\/81"[^>]*>([\s\S]*?)<\/a>/)
  assert.ok(card?.[1].includes('<dl'))
  assert.ok(!/<a\b|<button\b/.test(card[1]))
  assert.match(render([], 0), /don&#x27;t have any assigned tickets right now/)
  assert.match(render([], 0), /href="\/technician\/tickets\/unassigned"/)
  assert.match(render([], 11), /No assigned tickets on this page/)
  api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: { success: true, data: { tickets }, pagination: { ...pagination, hasNext: 'false' } } })
  await assert.rejects(getMyAssignedTickets, /Invalid assigned ticket list response/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(() => getMyAssignedTickets({ signal: controller.signal }), error => error.code === 'ERR_CANCELED')
  const { AuthContext } = await server.ssrLoadModule('/src/auth/AuthContext.js')
  const { default: AppRoutes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx')
  const route = role => renderToString(React.createElement(MemoryRouter, { initialEntries: ['/technician/tickets/81'] }, React.createElement(AuthContext.Provider, { value: { isAuthenticated: true, user: { role } } }, React.createElement(AppRoutes))))
  assert.match(route('TECHNICIAN'), /Ticket Workspace/)
  assert.ok(!route('TECHNICIAN').includes('aria-current="page"'))
  for (const role of ['EMPLOYEE', 'ADMIN']) assert.ok(!route(role).includes('Ticket Workspace'))
  console.log('Assigned ticket endpoint, ownership-param exclusion, pagination contract, accessible cards, privacy, empty states, cancellation and guarded placeholder passed.')
} finally { await server.close() }

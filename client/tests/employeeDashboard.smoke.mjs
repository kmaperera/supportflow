import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getEmployeeDashboard } = await server.ssrLoadModule('/src/api/dashboardApi.js')
  const { EmployeeDashboardContent } = await server.ssrLoadModule('/src/pages/employee/EmployeeDashboardPage.jsx')
  const { formatTicketStatus, formatTicketPriority, formatTicketDate } = await server.ssrLoadModule('/src/pages/employee/ticketFormatting.js')
  const { getApiErrorMessage } = await server.ssrLoadModule('/src/api/apiError.js')
  const summary = { totalTickets: 10, activeTickets: 7, openTickets: 1, assignedTickets: 1,
    inProgressTickets: 2, waitingForUserTickets: 1, reopenedTickets: 2, resolvedTickets: 2, closedTickets: 1 }
  const tickets = [{ id: 42, ticketNumber: 'SF-42', title: 'Laptop needs support', status: 'WAITING_FOR_USER',
    priority: { id: 99, name: 'CRITICAL' }, createdAt: '2026-09-11T01:00:00.000Z' }]
  const calls = []
  api.defaults.adapter = async config => {
    calls.push(config)
    assert.equal(config.method, 'get')
    return { config, status: 200, headers: {}, data: { success: true, data:
      config.url.endsWith('/employee/summary') ? { summary } : { tickets } } }
  }
  const data = await getEmployeeDashboard()
  assert.deepEqual(data, { summary, tickets })
  assert.deepEqual(calls.map(call => call.url).sort(), ['/dashboard/employee/summary', '/dashboard/recent-tickets'])
  assert.deepEqual(calls.find(call => call.url.endsWith('/recent-tickets')).params, { limit: 5 })
  const render = data => renderToString(React.createElement(MemoryRouter, null,
    React.createElement(EmployeeDashboardContent, { data }))).replaceAll('<!-- -->', '')
  const html = render(data)
  for (const label of ['Total Tickets', 'Active Tickets', 'Resolved Tickets', 'Closed Tickets', 'SF-42', 'Laptop needs support', 'Waiting for User', 'Critical']) assert.ok(html.includes(label))
  assert.ok(!html.includes('/employee/tickets/42'))
  const empty = render({ summary: Object.fromEntries(Object.keys(summary).map(key => [key, 0])), tickets: [] })
  assert.match(empty, /Create your first ticket/)
  assert.match(empty, /href="\/employee\/tickets\/new"/)
  assert.equal(formatTicketStatus('REOPENED'), 'Reopened')
  assert.equal(formatTicketStatus('IN_PROGRESS'), 'In Progress')
  for (const name of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) assert.equal(formatTicketPriority(name), name[0] + name.slice(1).toLowerCase())
  assert.equal(formatTicketPriority('Custom priority'), 'Custom priority')
  assert.equal(formatTicketDate('invalid'), 'Date unavailable')
  assert.equal(formatTicketDate(null), 'Date unavailable')
  assert.equal(formatTicketDate(tickets[0].createdAt), new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(tickets[0].createdAt)))
  api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: { success: true, data: {} } })
  await assert.rejects(getEmployeeDashboard, /Invalid dashboard response/)
  api.defaults.adapter = async () => { throw new Error('private database details') }
  await assert.rejects(getEmployeeDashboard, /private database details/)
  assert.equal(getApiErrorMessage(new Error('private database details'), 'Unable to load your dashboard.'), 'Unable to load your dashboard.')
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(() => getEmployeeDashboard({ signal: controller.signal }), error => error.code === 'ERR_CANCELED')
  console.log('Dashboard API contract, cards, recent tickets, empty state, formatting, safe errors and cancellation passed.')
} finally {
  await server.close()
}

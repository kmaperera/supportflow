import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getTechnicianDashboard } = await server.ssrLoadModule('/src/api/dashboardApi.js')
  const { TechnicianDashboardContent } = await server.ssrLoadModule('/src/pages/technician/TechnicianDashboardPage.jsx')
  const { getApiErrorMessage } = await server.ssrLoadModule('/src/api/apiError.js')
  const summary = { assignedTickets: 2, inProgressTickets: 3, waitingForUserTickets: 1, reopenedTickets: 1, resolvedTickets: 4, activeAssignedTickets: 7, unassignedQueueTickets: 99 }
  const tickets = [{ id: 81, ticketNumber: 'SUP-2026-000081', title: '<script>private</script>', status: 'WAITING_FOR_USER', priority: { id: 73, name: 'CRITICAL' }, createdAt: '2026-09-21T01:00:00Z' }]
  const sla = { response: { metTickets: 3, missedTickets: 2, pendingTickets: 6 }, resolution: { metTickets: 1, missedTickets: 3, pendingTickets: 7 } }
  const payloads = { '/dashboard/technician/summary': { summary }, '/dashboard/recent-tickets': { tickets }, '/dashboard/sla-compliance': { summary: sla } }
  const calls = []
  api.defaults.adapter = async config => {
    calls.push(config)
    assert.equal(config.method, 'get')
    assert.ok(Object.hasOwn(payloads, config.url))
    assert.deepEqual(config.params, config.url.endsWith('/recent-tickets') ? { limit: 5 } : undefined)
    return { config, status: 200, headers: {}, data: { success: true, data: payloads[config.url] } }
  }
  const data = await getTechnicianDashboard({ technicianId: 999 })
  assert.deepEqual(data, { summary, tickets, sla })
  assert.equal(calls.length, 3)
  const render = data => renderToString(React.createElement(MemoryRouter, null, React.createElement(TechnicianDashboardContent, { data }))).replaceAll('<!-- -->', '')
  const html = render(data)
  for (const text of ['Active Assigned Tickets', 'SUP-2026-000081', 'Waiting for User', 'Critical', 'In Progress', 'Reopened', 'First response', 'Pending milestones may already be overdue.']) assert.ok(html.includes(text))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(!html.includes('<script>'))
  assert.ok(!html.includes('/technician/tickets/81'))
  assert.ok(!html.includes('99'))
  assert.match(render({ ...data, tickets: [] }), /don&#x27;t have any assigned tickets right now/)
  assert.match(render({ ...data, tickets: [] }), /href="\/technician\/tickets\/unassigned"/)
  payloads['/dashboard/technician/summary'] = { summary: { ...summary, activeAssignedTickets: -1 } }
  await assert.rejects(getTechnicianDashboard, /Invalid technician dashboard response/)
  payloads['/dashboard/technician/summary'] = { summary }
  payloads['/dashboard/sla-compliance'] = { summary: { response: sla.response } }
  await assert.rejects(getTechnicianDashboard, /Invalid technician dashboard response/)
  api.defaults.adapter = async () => { throw new Error('Internal database details') }
  await assert.rejects(getTechnicianDashboard, /Internal database details/)
  assert.equal(getApiErrorMessage(new Error('Internal database details'), 'Unable to load your dashboard.'), 'Unable to load your dashboard.')
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(() => getTechnicianDashboard({ signal: controller.signal }), error => error.code === 'ERR_CANCELED')
  console.log('Technician dashboard contracts, scoped query parameters, cards, safe content, SLA labels, empty state, malformed responses and cancellation passed.')
} finally { await server.close() }

import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getTicketById } = await server.ssrLoadModule('/src/api/ticketApi.js')
  const { TicketDetailsContent } = await server.ssrLoadModule('/src/pages/employee/TicketDetailsPage.jsx')
  const ticket = { id: 81, ticketNumber: 'SUP-81', title: 'Printer failure', description: '<script>alert(1)</script>\nSecond line', status: 'WAITING_FOR_USER', priority: { name: 'HIGH' }, category: { name: 'Hardware' }, assignee: { firstName: 'Alex', lastName: 'Lee', email: 'private@example.test' }, internalNotes: 'private-note' }
  api.defaults.adapter = async config => {
    assert.equal(config.url, '/tickets/81')
    assert.equal(config.method, 'get')
    assert.equal(config.params, undefined)
    return { config, status: 200, headers: {}, data: { success: true, data: { ticket } } }
  }
  assert.deepEqual(await getTicketById('81'), ticket)
  const html = renderToString(React.createElement(TicketDetailsContent, { ticket }))
  for (const text of ['SUP-81', 'Printer failure', 'Waiting for User', 'High', 'Hardware', 'Alex Lee', '&lt;script&gt;', 'Second line']) assert.ok(html.includes(text))
  for (const text of ['<script>', 'private@example.test', 'private-note']) assert.ok(!html.includes(text))
  assert.match(renderToString(React.createElement(TicketDetailsContent, { ticket: { ...ticket, assignee: null } })), /Unassigned/)
  api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: {} })
  await assert.rejects(() => getTicketById('81'), /Invalid ticket detail/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(() => getTicketById('81', { signal: controller.signal }), error => error.code === 'ERR_CANCELED')
  console.log('Ticket details contract, safe description, metadata privacy, unassigned state and cancellation passed.')
} finally { await server.close() }

import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { createTicket } = await server.ssrLoadModule('/src/api/ticketApi.js')
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { validateCreateTicket, getCreateTicketErrors } = await server.ssrLoadModule('/src/pages/employee/createTicketValidation.js')
  const { default: CreateTicketPage } = await server.ssrLoadModule('/src/pages/employee/CreateTicketPage.jsx')
  const { default: Placeholder } = await server.ssrLoadModule('/src/pages/employee/EmployeePlaceholderPage.jsx')
  const valid = { title: '  Laptop issue  ', description: '  Laptop cannot start.  ', categoryId: '123', priorityId: '456' }
  assert.deepEqual(validateCreateTicket(valid), {})
  for (const [field, values] of Object.entries({ title: ['', '   ', 'abcd', 'a'.repeat(201)], description: ['', '   ', 'a'.repeat(9), 'a'.repeat(5001)], categoryId: ['', '0', '-1', '1.5', '18446744073709551616'], priorityId: ['', '0', 'abc'] })) {
    for (const value of values) assert.ok(validateCreateTicket({ ...valid, [field]: value })[field])
  }
  const ticket = { id: 99, ticketNumber: 'SUP-2026-000099' }
  api.defaults.adapter = async config => {
    assert.equal(config.method, 'post')
    assert.equal(config.url, '/tickets')
    assert.deepEqual(JSON.parse(config.data), { title: 'Laptop issue', description: 'Laptop cannot start.', categoryId: '123', priorityId: '456' })
    return { config, status: 201, headers: {}, data: { success: true, data: { ticket } } }
  }
  assert.deepEqual(await createTicket({ ...valid, createdBy: 1000, role: 'ADMIN' }), ticket)
  const backendError = (status, message, errors) => ({ response: { status, data: { success: false, message, errors } } })
  assert.ok(getCreateTicketErrors(backendError(422, 'Validation failed', [{ field: 'title', message: 'private detail' }])).fields.title)
  assert.ok(getCreateTicketErrors(backendError(404, 'Ticket category not found')).fields.categoryId)
  assert.ok(getCreateTicketErrors(backendError(400, 'Selected ticket priority is inactive')).fields.priorityId)
  assert.equal(getCreateTicketErrors(backendError(500, 'SQL details')).message, 'Unable to create your ticket. Please try again.')
  assert.match(getCreateTicketErrors(backendError(401, 'private')).message, /session/)
  assert.match(getCreateTicketErrors({ isAxiosError: true }).message, /connect/)
  const html = renderToString(React.createElement(MemoryRouter, null, React.createElement(CreateTicketPage)))
  assert.match(html, /<form/)
  assert.match(html, /Category options unavailable/)
  assert.match(html, /<button type="submit"/)
  assert.doesNotMatch(html, /<button type="submit"[^>]* disabled=""/)
  assert.ok(!html.includes('type="file"'))
  const success = renderToString(React.createElement(MemoryRouter, { initialEntries: [{ pathname: '/employee/tickets', state: { createdTicketNumber: ticket.ticketNumber } }] }, React.createElement(Placeholder, { title: 'My Tickets', phase: '14.6' })))
  assert.match(success, /SUP-2026-000099/)
  assert.match(success, /created successfully/)
  console.log('Create-ticket payload, validation boundaries, safe errors, unavailable options and success feedback passed.')
} finally {
  await server.close()
}

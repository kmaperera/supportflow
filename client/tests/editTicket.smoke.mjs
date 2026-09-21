import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { updateTicket } = await server.ssrLoadModule('/src/api/ticketApi.js')
  const { default: EditTicketForm } = await server.ssrLoadModule('/src/pages/employee/EditTicketForm.jsx')
  const ticket = { id: 81, title: 'Printer issue', description: 'Printer does not work.', category: { id: 73, name: 'Hardware' }, priority: { id: 91, name: 'HIGH' } }
  api.defaults.adapter = async config => {
    assert.equal(config.method, 'patch')
    assert.equal(config.url, '/tickets/81')
    assert.deepEqual(JSON.parse(config.data), { title: 'Printer issue', description: 'First line\nSecond line', categoryId: '73', priorityId: '91' })
    return { config, status: 200, headers: {}, data: { success: true, data: { ticket } } }
  }
  assert.deepEqual(await updateTicket('81', { title: ' Printer issue ', description: ' First line\nSecond line ', categoryId: '73', priorityId: '91', status: 'CLOSED', requesterId: 123 }), ticket)
  const html = renderToString(React.createElement(EditTicketForm, { ticket })).replaceAll('<!-- -->', '')
  for (const text of ['Printer issue', 'Printer does not work.', 'Hardware (current)', 'HIGH (current)', 'Save Changes', 'Cancel']) assert.ok(html.includes(text))
  assert.ok(!html.includes('name="status"'))
  api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: {} })
  await assert.rejects(() => updateTicket('81', { title: 'Valid title', description: 'Valid description' }), /Invalid ticket update/)
  console.log('Ticket update method, payload allowlist, trimming, line breaks, prefilled fields and response validation passed.')
} finally { await server.close() }

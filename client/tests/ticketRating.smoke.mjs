import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
 const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
 const { saveTicketFeedback } = await server.ssrLoadModule('/src/api/ticketApi.js')
 const { default: TicketRating } = await server.ssrLoadModule('/src/pages/employee/TicketRating.jsx')
 const feedback = { ticketId: 81, rating: 5, comment: 'Helpful support' }
 api.defaults.adapter = async config => {
  assert.equal(config.method, 'put'); assert.equal(config.url, '/tickets/81/feedback')
  assert.deepEqual(JSON.parse(config.data), { rating: 5, comment: 'Helpful support' })
  return { config, status: 200, headers: {}, data: { success: true, data: { feedback } } }
 }
 assert.deepEqual(await saveTicketFeedback('81', { rating: 5, comment: ' Helpful support ', userId: 999 }), feedback)
 const html = renderToString(React.createElement(TicketRating, { ticketId: '81' }))
 assert.equal((html.match(/type="radio"/g) || []).length, 5)
 assert.match(html, /maxLength="1000"/)
 assert.match(html, /replaces any previous rating/)
 api.defaults.adapter = async () => { throw { response: { status: 409 } } }
 await assert.rejects(() => saveTicketFeedback('81', { rating: 5, comment: '' }), error => error.response.status === 409)
 api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: {} })
 await assert.rejects(() => saveTicketFeedback('81', { rating: 5, comment: '' }), /Invalid feedback response/)
 console.log('Feedback PUT contract, payload allowlist, trimmed comment, rating controls and error propagation passed.')
} finally { await server.close() }

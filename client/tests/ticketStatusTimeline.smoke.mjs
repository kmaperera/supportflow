import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getTicketStatusHistory } = await server.ssrLoadModule('/src/api/ticketApi.js')
  const { StatusHistoryList } = await server.ssrLoadModule('/src/pages/employee/TicketStatusTimeline.jsx')
  const history = [
    { id: 91, fromStatus: 'OPEN', toStatus: 'ASSIGNED', changedAt: '2026-09-21T01:00:00Z', changedBy: { id: 123, firstName: 'Alex', lastName: 'Lee', email: 'private@example.test' }, reason: 'private reason' },
    { id: 92, fromStatus: 'ASSIGNED', toStatus: 'IN_PROGRESS', changedAt: '2026-09-21T02:00:00Z', changedBy: { firstName: 'Alex' } },
  ]
  api.defaults.adapter = async config => {
    assert.equal(config.url, '/tickets/81/status-history')
    assert.equal(config.method, 'get')
    assert.equal(config.params, undefined)
    return { config, status: 200, headers: {}, data: { success: true, data: { history } } }
  }
  assert.deepEqual(await getTicketStatusHistory('81'), history)
  const html = renderToString(React.createElement(StatusHistoryList, { history }))
  assert.ok(html.indexOf('Open') < html.indexOf('In Progress'))
  assert.match(html, /Changed by Alex Lee/)
  assert.ok(!html.includes('private@example.test'))
  assert.ok(!html.includes('private reason'))
  assert.match(renderToString(React.createElement(StatusHistoryList, { history: [] })), /No status history is available yet/)
  api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: {} })
  await assert.rejects(() => getTicketStatusHistory('81'), /Invalid status history/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(() => getTicketStatusHistory('81', { signal: controller.signal }), error => error.code === 'ERR_CANCELED')
  console.log('Status history contract, chronology, actor privacy, empty state and cancellation passed.')
} finally { await server.close() }

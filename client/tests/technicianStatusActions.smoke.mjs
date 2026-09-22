import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { updateTicketStatus } = await server.ssrLoadModule('/src/api/ticketApi.js')
  const { default: Actions } = await server.ssrLoadModule('/src/pages/technician/TicketStatusActions.jsx')
  for (const [status, label, target] of [['ASSIGNED', 'Start Work', 'IN_PROGRESS'], ['IN_PROGRESS', 'Wait for User', 'WAITING_FOR_USER'], ['WAITING_FOR_USER', 'Resume Work', 'IN_PROGRESS'], ['REOPENED', 'Resume Work', 'IN_PROGRESS']]) {
    const props = { ticket: { id: 81, status, assignedTo: 7 }, userId: '7', onUpdate: value => assert.equal(value, target) }
    const html = renderToString(React.createElement(Actions, props))
    assert.ok(html.includes(label))
    assert.ok(!html.includes('Resolve Ticket'))
    const tree = Actions(props)
    tree.props.children[1].props.children[1].props.onClick()
    assert.match(renderToString(React.createElement(Actions, { ...props, pending: true })), /disabled=""/)
    assert.match(renderToString(React.createElement(Actions, { ...props, pending: true })), /Updating/)
    for (const assignedTo of [null, 99]) assert.ok(!renderToString(React.createElement(Actions, { ...props, ticket: { ...props.ticket, assignedTo } })).includes('<button'))
    api.defaults.adapter = async config => {
      assert.equal(config.method, 'patch')
      assert.equal(config.url, '/tickets/81/status')
      assert.deepEqual(JSON.parse(config.data), { status: target })
      return { config, status: 200, headers: {}, data: { success: true, data: { ticket: { ...props.ticket, status: target } } } }
    }
    assert.equal((await updateTicketStatus(81, target)).status, target)
  }
  for (const status of ['OPEN', 'RESOLVED', 'CLOSED']) assert.ok(!renderToString(React.createElement(Actions, { ticket: { status, assignedTo: 7 }, userId: 7 })).includes('<button'))
  for (const status of [400, 403, 404, 409, 422, 500]) {
    api.defaults.adapter = async () => { throw { response: { status } } }
    await assert.rejects(() => updateTicketStatus(81, 'IN_PROGRESS'), error => error.response.status === status)
  }
  console.log('Working-status action matrix, ownership gating, exact mutation contract, loading state and error propagation passed.')
} finally { await server.close() }

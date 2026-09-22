import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'
import { parseSlaTimestamp, formatRemaining } from '../src/pages/technician/slaTiming.js'
assert.equal(parseSlaTimestamp('2026-09-22 12:00:00'), Date.parse('2026-09-22T12:00:00Z'))
assert.equal(parseSlaTimestamp('2026-09-22T17:30:00+05:30'), Date.parse('2026-09-22T12:00:00Z'))
for (const value of [null, '', 'bad', 0]) assert.equal(parseSlaTimestamp(value), null)
assert.equal(formatRemaining(0, 10), 'Deadline passed')
assert.equal(formatRemaining(90061000, 0), '1d 01h 01m 01s remaining')
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: Timers } = await server.ssrLoadModule('/src/pages/technician/TicketSlaTimers.jsx')
  const due = new Date(Date.now() + 3600000).toISOString()
  const ticket = { status: 'IN_PROGRESS', responseDueAt: due, resolutionDueAt: due }
  const render = updates => renderToString(React.createElement(Timers, { ticket: { ...ticket, ...updates } }))
  assert.equal((render({}).match(/remaining/g) || []).length, 2)
  assert.equal((render({ firstResponseAt: due }).match(/remaining/g) || []).length, 1)
  assert.match(render({ firstResponseAt: due }), /Responded/)
  assert.doesNotMatch(render({ status: 'CLOSED' }), /remaining/)
  assert.doesNotMatch(render({ status: 'RESOLVED', resolvedAt: due }), /remaining/)
  assert.match(render({ status: 'REOPENED', resolvedAt: null }), /remaining/)
  assert.match(render({ responseDueAt: 'bad' }), /No SLA deadline available/)
  assert.match(render({ resolutionDueAt: '2020-01-01T00:00:00Z' }), /Deadline passed/)
  assert.doesNotMatch(render({}), /aria-live/)
  console.log('SLA UTC parsing, countdown formatting, completion, closed/reopened and missing/expired states passed.')
} finally { await server.close() }

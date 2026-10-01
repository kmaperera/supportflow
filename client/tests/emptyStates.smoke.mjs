import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const load = file => server.ssrLoadModule(`/src/pages/${file}.jsx`)
  const { AuthContext } = await server.ssrLoadModule('/src/auth/AuthContext.js')
  const render = (Component, props = {}) => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(AuthContext.Provider, { value: { user: { id: 1, role: 'EMPLOYEE' } } }, React.createElement(Component, props))))
  const { MyTicketsList } = await load('employee/MyTicketsPage')
  const empty = render(MyTicketsList, { tickets: [], totalRecords: 0 })
  assert.match(empty, /href="\/employee\/tickets\/new"/)
  assert.match(empty, /support tickets yet/)
  const page = render(MyTicketsList, { tickets: [], totalRecords: 5 })
  assert.match(page, /No tickets on this page/)
  assert.doesNotMatch(page, /support tickets yet/)
  const { UnassignedTicketsList } = await load('technician/UnassignedTicketsPage')
  const filtered = render(UnassignedTicketsList, { tickets: [], totalRecords: 0, filtered: true, onReset() {} })
  assert.match(filtered, /current search or filters/)
  assert.match(filtered, /Clear filters/)
  assert.doesNotMatch(filtered, /right now/)
  const { default: Reports } = await load('admin/AdminReportsPage')
  assert.match(render(Reports), /Choose a report type and criteria, then generate a report/)
  assert.doesNotMatch(render(Reports), /No report data found/)
  const { default: ReportResults } = await load('admin/ReportResults')
  assert.match(render(ReportResults, { type: 'tickets', report: { rows: [], pagination: { totalItems: 0 } } }), /No report data found for the selected criteria/)
  const { default: MyTickets } = await load('employee/MyTicketsPage')
  const initial = render(MyTickets)
  assert.match(initial, /Loading tickets/)
  assert.doesNotMatch(initial, /support tickets yet|No tickets match/)
  console.log('True/filtered/page empty states, valid next links, report idle/empty distinction and initial loading separation passed.')
} finally { await server.close() }

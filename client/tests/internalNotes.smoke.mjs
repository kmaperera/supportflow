import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getTicketInternalNotes, addTicketInternalNote, getTicketComments } = await server.ssrLoadModule('/src/api/ticketApi.js')
  const { default: Notes, InternalNoteList } = await server.ssrLoadModule('/src/pages/technician/TicketInternalNotes.jsx')
  const note = { id: 1, commentType: 'INTERNAL', content: '<script>private note</script>\nNext line', author: { id: 7, firstName: 'Alex', role: 'TECHNICIAN', email: 'hidden@example.test' }, createdAt: '2026-09-22T00:00:00Z' }
  const publicReply = { ...note, id: 2, commentType: 'PUBLIC', content: 'public message' }
  api.defaults.adapter = async config => {
    if (config.method === 'get') {
      assert.equal(config.url, '/tickets/81/comments')
      assert.equal(config.params, undefined)
      return { config, status: 200, headers: {}, data: { success: true, data: { comments: [note, publicReply] } } }
    }
    assert.equal(config.url, '/tickets/81/internal-notes')
    assert.equal(config.method, 'post')
    assert.deepEqual(JSON.parse(config.data), { content: 'Internal text' })
    return { config, status: 201, headers: {}, data: { success: true, data: { comment: note } } }
  }
  assert.deepEqual(await getTicketInternalNotes(81), [note])
  assert.deepEqual(await getTicketComments(81), [publicReply])
  assert.deepEqual(await addTicketInternalNote(81, { content: ' Internal text ', commentType: 'PUBLIC' }), note)
  const html = renderToString(React.createElement(InternalNoteList, { notes: [note, publicReply], userId: 7 }))
  assert.match(html, /You/); assert.match(html, /Technician/); assert.match(html, /&lt;script&gt;/)
  for (const text of ['<script>', 'public message', 'hidden@example.test']) assert.ok(!html.includes(text))
  assert.match(renderToString(React.createElement(InternalNoteList, { notes: [] })), /No internal notes yet/)
  const render = (status, assignedTo) => renderToString(React.createElement(Notes, { ticket: { id: 81, status, assignedTo }, userId: 7, draft: '' }))
  assert.match(render('RESOLVED', 7), /Add Note/)
  assert.ok(!render('CLOSED', 7).includes('<textarea'))
  assert.ok(!render('OPEN', null).includes('<textarea'))
  assert.ok(!render('ASSIGNED', 99).includes('<textarea'))
  api.defaults.adapter = async config => ({ config, status: 201, headers: {}, data: { success: true, data: { comment: publicReply } } })
  await assert.rejects(() => addTicketInternalNote(81, { content: 'test' }), /Invalid internal note response/)
  console.log('Internal note contracts, public/internal isolation, resolved/closed ownership rules, safe rendering and empty state passed.')
} finally { await server.close() }

import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getTicketComments, addTicketComment } = await server.ssrLoadModule('/src/api/ticketApi.js')
  const { PublicCommentList } = await server.ssrLoadModule('/src/pages/employee/TicketConversation.jsx')
  const comment = { id: 81, commentType: 'PUBLIC', content: '<script>unsafe</script>\nReply', createdAt: '2026-09-21T01:00:00Z', author: { id: 12, firstName: 'Alex', email: 'private@example.test' } }
  const internal = { ...comment, id: 82, commentType: 'INTERNAL', content: 'secret internal note' }
  api.defaults.adapter = async config => {
    assert.equal(config.url, '/tickets/42/comments')
    if (config.method === 'get') return { config, status: 200, headers: {}, data: { success: true, data: { comments: [comment, internal] } } }
    assert.equal(config.method, 'post')
    assert.deepEqual(JSON.parse(config.data), { content: 'Hello support' })
    return { config, status: 201, headers: {}, data: { success: true, data: { comment } } }
  }
  assert.deepEqual(await getTicketComments('42'), [comment])
  assert.deepEqual(await addTicketComment('42', { content: '  Hello support  ', userId: 99, commentType: 'INTERNAL' }), comment)
  const html = renderToString(React.createElement(PublicCommentList, { comments: [comment, internal], userId: 12 }))
  assert.match(html, /You/)
  assert.match(html, /&lt;script&gt;/)
  for (const text of ['<script>', 'secret internal note', 'private@example.test']) assert.ok(!html.includes(text))
  assert.match(renderToString(React.createElement(PublicCommentList, { comments: [] })), /No replies yet/)
  api.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: {} })
  await assert.rejects(() => getTicketComments('42'), /Invalid conversation/)
  console.log('Public comment contract, payload allowlist, internal exclusion, safe text and empty state passed.')
} finally { await server.close() }

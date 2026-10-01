import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { getApiErrorMessage, getResourceError } = await server.ssrLoadModule('/src/api/apiError.js')
  const failure = (status, message) => ({ isAxiosError: true, response: { status, data: { success: false, message } } })
  for (const status of [400, 422, 500]) {
    assert.equal(getApiErrorMessage(failure(status, 'SQL error secret token /private/path'), 'Unable to save.'), 'Unable to save.')
  }
  assert.match(getApiErrorMessage({ isAxiosError: true }, 'fallback'), /Unable to connect/)
  assert.match(getApiErrorMessage(failure(401), 'fallback'), /sign in again/)
  assert.equal(getResourceError(failure(404)).errorTitle, 'Ticket not found')
  assert.equal(getResourceError(failure(403)).errorTitle, 'Access denied')
  assert.equal(getResourceError(failure(404), 'Article').unavailable, true)
  assert.equal(getResourceError(failure(500)).unavailable, false)
  const conflict = 'Ticket assignment has changed. Refresh and try again.'
  assert.equal(getApiErrorMessage(failure(409, conflict), 'fallback'), conflict)
  assert.equal(getApiErrorMessage(failure(409, 'internal state'), 'fallback'), 'fallback')
  const { default: ErrorState } = await server.ssrLoadModule('/src/components/ErrorState.jsx')
  const markup = renderToStaticMarkup(React.createElement(ErrorState, { title: 'Unable to load tickets.', message: '<script>not HTML</script>', onRetry: async () => {} }))
  assert.match(markup, /role="alert"/)
  assert.match(markup, /type="button"/)
  assert.match(markup, /Retry/)
  assert.match(markup, /&lt;script&gt;/)
  assert.doesNotMatch(markup, /<script>|No tickets|Loading tickets/)
  console.log('Safe error messages, 401/403/404/409 distinctions, alert/retry semantics, escaped content and error/empty separation passed.')
} finally { await server.close() }

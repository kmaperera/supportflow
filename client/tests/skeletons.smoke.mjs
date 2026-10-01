import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: ContentSkeleton } = await server.ssrLoadModule('/src/components/ContentSkeleton.jsx')
  const render = props => renderToStaticMarkup(React.createElement(ContentSkeleton, props, 'Loading tickets...'))
  for (const variant of ['cards', 'rows', 'summary', 'dashboard', 'workload', 'detail', 'chart', 'table', 'report']) {
    const html = render({ initial: true, variant, headers: ['Time', 'Actor'] })
    assert.match(html, /role="status"/)
    assert.match(html, /Loading tickets/)
    assert.match(html, /aria-hidden="true"/)
    assert.match(html, /motion-reduce:animate-none/)
    assert.doesNotMatch(html, /<(button|input|select|textarea)\b/)
    if (['table', 'report'].includes(variant)) {
      assert.match(html, /<thead\b/)
      assert.equal((html.match(/<td\b/g) || []).length, 6)
      assert.match(html, /layout-table/)
    }
    const background = render({ initial: false, variant })
    assert.doesNotMatch(background, /animate-pulse|<table/)
    assert.match(background, /Loading tickets/)
  }
  const { default: Reports } = await server.ssrLoadModule('/src/pages/admin/AdminReportsPage.jsx')
  const idle = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Reports)))
  assert.doesNotMatch(idle, /animate-pulse/)
  assert.match(idle, /Generate Report/)
  const { default: ReportSkeleton } = await server.ssrLoadModule('/src/pages/admin/ReportSkeleton.jsx')
  const pending = renderToStaticMarkup(React.createElement(ReportSkeleton, { type: 'tickets', initial: true }))
  assert.match(pending, /Generating report/)
  assert.match(pending, />Requester<\/th>/)
  assert.match(pending, /animate-pulse/)
  console.log('Skeleton variants, background fallback, report idle/pending states and accessible decorative markup passed.')
} finally { await server.close() }

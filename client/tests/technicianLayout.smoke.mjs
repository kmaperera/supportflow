import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { AuthContext } = await server.ssrLoadModule('/src/auth/AuthContext.js')
  const { default: AppRoutes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx')
  const state = { isAuthenticated: true, isInitializing: false, user: { role: 'TECHNICIAN', firstName: 'Alex', lastName: 'Lee' } }
  const render = (path, auth = state) => renderToString(React.createElement(MemoryRouter, { initialEntries: [path] },
    React.createElement(AuthContext.Provider, { value: auth }, React.createElement(AppRoutes)))).replaceAll('<!-- -->', '')
  for (const [path, phase] of [['/technician', '15.2'], ['/technician/tickets/assigned', '15.3'], ['/technician/tickets/unassigned', '15.4'], ['/technician/notifications', '15.16'], ['/technician/profile', null]]) {
    const html = render(path)
    assert.match(html, /Technician navigation/)
    assert.match(html, /Alex Lee/)
    assert.match(html, /aria-label="Open technician menu" aria-expanded="false" aria-controls="technician-navigation"/)
    assert.equal((html.match(/<main\b/g) || []).length, 1)
    const active = html.match(/<a\b[^>]*aria-current="page"[^>]*>/g) || []
    assert.equal(active.length, 1)
    assert.ok(active[0].includes(`href="${path}"`))
    if (phase) {
      if (path === '/technician') assert.match(html, /Loading dashboard/)
      else if (path === '/technician/tickets/assigned') assert.match(html, /Loading assigned tickets/)
      else assert.ok(html.includes(`Coming in Phase ${phase}.`))
      assert.ok(!html.includes('Log out all sessions'))
    } else {
      assert.match(html, /My Profile/)
      assert.match(html, /Log out all sessions/)
      assert.ok(!html.includes('Return to dashboard'))
    }
    assert.match(render(path, { ...state, isLoggingOut: true }), /disabled=""[^>]*>Logging out/)
    for (const role of ['EMPLOYEE', 'ADMIN', 'UNKNOWN']) assert.ok(!render(path, { ...state, user: { role } }).includes('Technician workspace'))
    assert.ok(!render(path, { isAuthenticated: false }).includes('Technician workspace'))
    assert.ok(!render(path, { ...state, user: { ...state.user, mustChangePassword: true } }).includes('Technician workspace'))
    assert.ok(!render(path, { ...state, isInitializing: true }).includes('Technician workspace'))
  }
  assert.match(render('/technician', { ...state, user: { role: 'TECHNICIAN', email: 'tech@example.test' } }), /tech@example.test/)
  assert.match(render('/technician', { ...state, user: { role: 'TECHNICIAN' } }), /text-sm font-medium">Technician/)
  assert.match(render('/technician/missing'), /Page Not Found/)
  assert.ok(!render('/technician/missing', { ...state, user: { role: 'EMPLOYEE' } }).includes('Technician workspace'))
  console.log('Technician shell, nested placeholders, active links, profile reuse, identity fallback and guard matrix passed.')
} finally { await server.close() }

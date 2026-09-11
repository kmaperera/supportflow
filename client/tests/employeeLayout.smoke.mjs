import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { AuthContext } = await server.ssrLoadModule('/src/auth/AuthContext.js')
  const { default: AppRoutes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx')
  const state = { isAuthenticated: true, isInitializing: false, user: { role: 'EMPLOYEE', firstName: 'Alex', lastName: 'Lee' } }
  const render = (path, auth = state) => renderToString(React.createElement(MemoryRouter, { initialEntries: [path] },
    React.createElement(AuthContext.Provider, { value: auth }, React.createElement(AppRoutes))))
  for (const [path, phase] of [['/employee', '14.2'], ['/employee/tickets/new', '14.3'], ['/employee/tickets', '14.6'], ['/employee/knowledge-base', '14.17'], ['/employee/notifications', '14.16']]) {
    const html = render(path)
    assert.match(html, /SupportFlow/)
    assert.match(html, /Alex Lee/)
    assert.ok(html.replaceAll('<!-- -->', '').includes(`Coming in Phase ${phase}.`))
    const activeLinks = html.match(/<a\b[^>]*aria-current="page"[^>]*>/g) || []
    assert.equal(activeLinks.length, 1)
    assert.ok(activeLinks[0].includes(`href="${path}"`))
    assert.match(html, /href="\/profile"/)
    assert.ok(!html.includes('Log out all sessions'))
    assert.match(render(path, { ...state, isLoggingOut: true }), /disabled=""[^>]*>Logging out/)
    for (const role of ['ADMIN', 'TECHNICIAN', 'UNKNOWN']) {
      assert.ok(!render(path, { ...state, user: { role } }).includes('Employee workspace'))
    }
    assert.ok(!render(path, { isAuthenticated: false }).includes('Employee workspace'))
    assert.ok(!render(path, { ...state, user: { ...state.user, mustChangePassword: true } }).includes('Employee workspace'))
  }
  assert.match(render('/employee', { ...state, user: { role: 'EMPLOYEE', email: 'alex@example.test' } }), /alex@example.test/)
  assert.match(render('/employee/missing'), /Page Not Found/)
  assert.ok(!render('/employee/missing', { ...state, user: { role: 'ADMIN' } }).includes('Employee workspace'))
  console.log('Employee nested placeholders, exact active links, header fallback, logout state, and role guards passed.')
} finally {
  await server.close()
}

import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Navigate, Outlet } from 'react-router-dom'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: AppRoutes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx')
  const { default: ProtectedRoute } = await server.ssrLoadModule('/src/routes/ProtectedRoute.jsx')
  const { AuthContext } = await server.ssrLoadModule('/src/auth/AuthContext.js')
  const routes = ['/employee/dashboard', '/technician/dashboard', '/admin/dashboard']
  function render(path, state, content = React.createElement(AppRoutes)) {
    return renderToString(React.createElement(MemoryRouter, { initialEntries: [path] },
      React.createElement(AuthContext.Provider, { value: state }, content)))
  }
  for (const path of routes) {
    const waiting = render(path, { isInitializing: true, isAuthenticated: false })
    assert.match(waiting, /Checking session/)
    assert.ok(!waiting.includes('Dashboard'))
    const allowed = render(path, { isInitializing: false, isAuthenticated: true, user: { role: path.split('/')[1].toUpperCase(), mustChangePassword: false } })
    assert.match(allowed, /Dashboard/)
  }
  // Inspect the returned navigation element inside React's render context,
  // avoiding SSR's intentionally unexecuted Navigate effect.
  function RedirectProbe() {
    const element = ProtectedRoute()
    assert.equal(element.type, Navigate)
    assert.equal(element.props.to, '/login')
    assert.equal(element.props.replace, true)
    assert.equal(element.props.state.from.pathname, '/admin/dashboard')
    assert.equal(element.props.state.from.search, '?tab=open')
    assert.equal(element.props.state.from.hash, '#tickets')
    return null
  }
  render('/admin/dashboard?tab=open#tickets', { isInitializing: false, isAuthenticated: false }, React.createElement(RedirectProbe))
  function OutletProbe() { assert.equal(ProtectedRoute().type, Outlet); return null }
  render('/admin/dashboard', { isInitializing: false, isAuthenticated: true }, React.createElement(OutletProbe))
  assert.match(render('/login', { isInitializing: false, isAuthenticated: false, authError: null }), /Welcome back/)
  console.log('Protected-route initialization, redirect state, authenticated outlets and public login smoke passed.')
} finally { await server.close() }

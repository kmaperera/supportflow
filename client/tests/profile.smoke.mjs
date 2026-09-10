import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { AuthContext } = await server.ssrLoadModule('/src/auth/AuthContext.js')
  const { default: AppRoutes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx')
  const render = state => renderToString(React.createElement(MemoryRouter, { initialEntries: ['/profile'] },
    React.createElement(AuthContext.Provider, { value: state }, React.createElement(AppRoutes))))
  for (const role of ['ADMIN', 'TECHNICIAN', 'EMPLOYEE']) {
    const state = { isAuthenticated: true, isInitializing: false, user: {
      firstName: 'Malith', lastName: 'Perera', email: 'profile@example.test', role,
      isActive: true, mustChangePassword: false, accessToken: 'secret-not-for-display',
    } }
    const html = render(state)
    assert.match(html, /My Profile/)
    assert.match(html, /Malith Perera/)
    assert.match(html, /profile@example.test/)
    assert.ok(html.includes(`href="/${role.toLowerCase()}"`))
    assert.ok(!html.includes('secret-not-for-display'))
    assert.ok(!render({ ...state, user: { ...state.user, mustChangePassword: true } }).includes('My Profile'))
  }
  assert.ok(!render({ isAuthenticated: false, isInitializing: false }).includes('My Profile'))
  assert.ok(!render({ isAuthenticated: false, isInitializing: true }).includes('My Profile'))
  assert.ok(!render({ isAuthenticated: true, user: { role: 'UNKNOWN' } }).includes('My Profile'))
  console.log('Profile rendering, role-home links, safe fields and access guard matrix passed.')
} finally {
  await server.close()
}

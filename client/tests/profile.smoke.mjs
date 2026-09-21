import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { AuthContext } = await server.ssrLoadModule('/src/auth/AuthContext.js')
  const { default: AppRoutes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx')
  const render = (state, path = state.user?.role === 'EMPLOYEE' ? '/employee/profile' : '/profile') => renderToString(React.createElement(MemoryRouter, { initialEntries: [path] },
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
    assert.equal((html.match(/<main\b/g) || []).length, 1)
    assert.ok(html.includes('Log out all sessions'))
    if (role === 'EMPLOYEE') {
      assert.match(html, /Employee navigation/)
      assert.match(html, /aria-current="page"[^>]*href="\/employee\/profile"/)
      assert.ok(!html.includes('Return to dashboard'))
      assert.ok(!render(state, '/profile').includes('My Profile'))
    } else {
      assert.match(html, /Return to dashboard/)
      assert.ok(!html.includes('Employee navigation'))
      assert.ok(!render(state, '/employee/profile').includes('My Profile'))
    }
    assert.ok(!render({ ...state, user: { ...state.user, mustChangePassword: true } }).includes('My Profile'))
    assert.ok(!render({ ...state, user: { ...state.user, mustChangePassword: true } }, '/profile').includes('My Profile'))
  }
  assert.ok(!render({ isAuthenticated: false, isInitializing: false }).includes('My Profile'))
  assert.ok(!render({ isAuthenticated: false, isInitializing: true }).includes('My Profile'))
  assert.ok(!render({ isAuthenticated: true, user: { role: 'UNKNOWN' } }).includes('My Profile'))
  assert.ok(!render({ isAuthenticated: false, isInitializing: false }, '/employee/profile').includes('My Profile'))
  console.log('Profile rendering, role-home links, safe fields and access guard matrix passed.')
} finally {
  await server.close()
}

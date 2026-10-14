// Real Chromium cookies + actual React auth UI; isolated backend persistence.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { app, user, records } = await require('../../server/tests/helpers/cookieApp')()
const users = require('../../server/src/modules/users/user.repository')
users.updatePassword = async (id, hash) => { user.password_hash = hash; user.must_change_password = 0 }
require('../../server/src/config/database').getConnection = async () => ({ async beginTransaction() {}, async commit() {}, async rollback() {}, release() {} })
const api = app.listen(5098, 'localhost')
await new Promise(resolve => api.once('listening', resolve))
const port = process.env.KEYBOARD_CDP_PORT || '9223'
const base = 'http://localhost:5197/tests/authentication.browser.html#/login'
let ws, target, stage = 'setup'
const faults = [], responses = []
try {
  target = await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' })).json()
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let sequence = 0; const pending = new Map()
  ws.onmessage = event => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') faults.push('Browser exception')
    if (message.method === 'Runtime.consoleAPICalled' && ['warning', 'error'].includes(message.params.type)) faults.push('Console warning/error')
    if (message.method === 'Network.loadingFailed' && message.params.corsErrorStatus) faults.push('CORS failure')
    if (message.method === 'Audits.issueAdded' && /Cookie/.test(message.params.issue.code)) faults.push('Cookie issue')
    if (message.method === 'Network.responseReceived' && message.params.response.url.startsWith('http://localhost:5098/')) responses.push(message.params.response.status)
    if (!message.id) return
    const call = pending.get(message.id); pending.delete(message.id)
    if (message.error) call.reject(Error('CDP command failed')); else call.resolve(message.result)
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw Error('Fixture browser evaluation failed')
    return result.result.value
  }
  async function until(expression) {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 50)) }
    throw Error('Browser fixture did not reach expected state')
  }
  const state = expression => until('window.authFixture?.state && ' + expression)
  const cookie = async () => (await send('Network.getCookies', { urls: ['http://localhost:5098/api/v1/auth/refresh'] })).cookies.filter(item => item.name === 'refreshToken')
  async function fill(id, value) { await evaluate(`document.getElementById(${JSON.stringify(id)}).focus();document.getElementById(${JSON.stringify(id)}).select()`); await send('Input.insertText', { text: value }) }
  async function login(password = 'CookieFixture123!') {
    await until('Boolean(document.getElementById("login-email"))')
    await fill('login-email', user.email); await fill('login-password', password)
    await evaluate('document.querySelector("form").requestSubmit()')
  }
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable'); await send('Audits.enable')
  await send('Network.clearBrowserCookies'); await send('Page.navigate', { url: base })
  stage = 'missing-cookie startup'
  await state('!window.authFixture.state.initializing && !window.authFixture.state.authenticated')
  assert.equal(await evaluate('window.authFixture.refreshCalls'), 1)
  assert.equal(await evaluate('window.authFixture.initialMemoryToken'), false)
  stage = 'login'
  await login(); await state('window.authFixture.state.authenticated')
  await until('location.hash === "#/employee"')
  assert.equal(await evaluate('window.authFixture.hasToken()'), true)
  assert.equal(await evaluate('document.cookie.includes("refreshToken")'), false)
  const before = await cookie(); assert.equal(before.length, 1); assert.ok(before[0].httpOnly); assert.equal(before[0].sameSite, 'Lax'); assert.equal(before[0].path, '/api/v1/auth')
  assert.equal(await evaluate('JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage)]).includes("eyJ")'), false)
  stage = 'F5 restoration'
  await send('Page.reload', { ignoreCache: true })
  await state('!window.authFixture.state.initializing && window.authFixture.state.authenticated')
  assert.equal(await evaluate('window.authFixture.refreshCalls'), 1)
  assert.equal(await evaluate('window.authFixture.initialMemoryToken'), false)
  assert.equal(await evaluate('window.authFixture.hasToken()'), true)
  assert.notEqual((await cookie())[0].value, before[0].value)
  stage = 'parallel 401 recovery'
  const expiredToken = require('../../server/node_modules/jsonwebtoken').sign({ type: 'access', role: user.role }, process.env.JWT_ACCESS_SECRET, { subject: String(user.id), algorithm: 'HS256', expiresIn: -1 })
  assert.deepEqual(await evaluate(`window.authFixture.concurrentRecovery(${JSON.stringify(expiredToken)})`), [200, 200, 200])
  assert.equal(await evaluate('window.authFixture.refreshCalls'), 2)
  stage = 'logout'
  await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent === "Logout").click()')
  await state('!window.authFixture.state.authenticated'); await until('location.hash === "#/login"')
  for (let i = 0; i < 100 && (await cookie()).length; i++) await new Promise(resolve => setTimeout(resolve, 25))
  assert.equal((await cookie()).length, 0); assert.equal(await evaluate('window.authFixture.hasToken()'), false)
  stage = 'failed F5 restoration'
  await send('Page.reload', { ignoreCache: true }); await state('!window.authFixture.state.initializing && !window.authFixture.state.authenticated')
  assert.equal(await evaluate('window.authFixture.refreshCalls'), 1)
  stage = 'forced password change'
  user.must_change_password = 1
  await login(); await until('location.hash === "#/change-password" && Boolean(document.getElementById("currentPassword"))')
  await fill('currentPassword', 'CookieFixture123!'); await fill('newPassword', 'BrowserChanged123!'); await fill('confirmPassword', 'BrowserChanged123!')
  await evaluate('document.querySelector("form").requestSubmit()'); await state('!window.authFixture.state.authenticated'); await until('location.hash === "#/login"')
  assert.equal((await cookie()).length, 0); assert.ok(records.every(row => row.revoked_at));
  stage = 'relogin and logout-all'
  await login('BrowserChanged123!'); await until('location.hash === "#/employee"')
  await evaluate('[...document.querySelectorAll("button")].find(button => button.textContent === "Log out all sessions").click()')
  await until('Boolean(document.querySelector("dialog[open]"))')
  await evaluate('[...document.querySelector("dialog[open]").querySelectorAll("button")].find(button => button.textContent === "Log Out All Sessions").click()')
  await state('!window.authFixture.state.authenticated'); await until('location.hash === "#/login"')
  assert.equal((await cookie()).length, 0); assert.ok(records.every(row => row.revoked_at))
  // Expected unauthorized startup/expired bearer responses are deliberately
  // exercised. Chrome's network resource error messages are checked separately
  // from runtime errors below; no raw credentials are emitted.
  assert.ok(!responses.includes(500));
  assert.deepEqual(faults, [])
  console.log('PASS: real auth UI login, StrictMode/F5 restoration, failed restoration, three-request single-flight recovery, HttpOnly/storage, logout, forced password change/relogin and logout-all; no runtime/CORS/cookie issues.')
  // Closing through the target's own websocket can close it before its command
  // response arrives. Use Chrome's HTTP endpoint, then close the transport.
  await fetch(`http://localhost:${port}/json/close/${target.id}`)
} catch { console.error('Authentication browser regression failed at ' + stage + ' (details suppressed).'); process.exitCode = 1 }
finally { ws?.close(); api.closeAllConnections(); await new Promise(resolve => api.close(resolve)); await require('../../server/src/config/database').end() }

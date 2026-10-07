// Uses an isolated Edge/Chromium instance on port 9223; no real user/database data.
import assert from 'node:assert/strict'
import http from 'node:http'
import cookieApp from './helpers/cookieApp.js'
const { app } = await cookieApp()
const api = app.listen(5097)
const frontend = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html')
  res.end('<!doctype html><title>Cookie fixture</title><h1>Cookie fixture</h1>')
}).listen(5197)
await Promise.all([api, frontend].map(server => new Promise(resolve => server.once('listening', resolve))))
let ws, target
const port = process.env.COOKIE_CDP_PORT || '9223'
try {
  target = await (await fetch(`http://localhost:${port}/json/new?http://localhost:5197/api/v1/auth/probe`, { method: 'PUT' })).json()
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let id = 0
  const pending = new Map()
  ws.onmessage = event => {
    const result = JSON.parse(event.data), request = pending.get(result.id)
    if (!request) return
    pending.delete(result.id)
    if (result.error) request.reject(Error(result.error.message)); else request.resolve(result.result)
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method, params })) })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw Error('Browser evaluation failed')
    return result.result.value
  }
  await send('Network.enable'); await send('Page.enable')
  await send('Network.clearBrowserCookies')
  const setup = () => evaluate(`window.request = async (path, body) => {
    const response = await fetch('http://localhost:5097/api/v1/auth/'+path, {method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json(); if(data.data?.accessToken)window.accessToken=data.data.accessToken;
    return {status:response.status,refreshInJson:Boolean(data.data?.refreshToken),cookieHeaderReadable:response.headers.get('set-cookie')!==null};
  }; true`)
  await setup()
  const login = () => evaluate(`window.request('login',{email:'cookie@example.com',password:'CookieFixture123!'})`)
  const cookies = async () => (await send('Network.getCookies', { urls: ['http://localhost:5097/api/v1/auth/refresh'] })).cookies.filter(c => c.name === 'refreshToken')
  assert.deepEqual(await login(), { status: 200, refreshInJson: false, cookieHeaderReadable: false })
  const [cookie] = await cookies()
  assert.ok(cookie.httpOnly); assert.equal(cookie.secure, false); assert.equal(cookie.sameSite, 'Lax')
  assert.equal(cookie.path, '/api/v1/auth'); assert.equal(cookie.domain, 'localhost')
  assert.ok(cookie.expires > Date.now()/1000)
  assert.equal(await evaluate(`document.cookie.includes('refreshToken')`), false)
  // The document is on the same host and matching cookie path: absence proves HttpOnly,
  // not merely that the frontend page was outside the cookie Path.
  const outside = (await send('Network.getCookies', { urls: ['http://localhost:5097/api/v1/tickets/my'] })).cookies
  assert.equal(outside.some(c => c.name === 'refreshToken'), false)
  await send('Page.reload')
  for(let i=0;i<100;i++) {
    if(await evaluate(`document.readyState==='complete' && typeof window.request==='undefined'`))break
    await new Promise(resolve=>setTimeout(resolve,50))
  }
  assert.equal(await evaluate(`typeof window.accessToken`), 'undefined')
  await setup()
  assert.equal((await evaluate(`window.request('refresh')`)).status, 200)
  assert.notEqual((await cookies())[0].value, cookie.value)
  assert.equal(await evaluate(`(async()=> (await fetch('http://localhost:5097/api/v1/auth/me',{credentials:'include',headers:{Authorization:'Bearer '+window.accessToken}})).status)()`), 200)
  assert.equal((await evaluate(`window.request('logout')`)).status, 200)
  assert.equal((await cookies()).length, 0)
  assert.equal((await evaluate(`window.request('refresh')`)).status, 401)
  assert.equal((await login()).status, 200)
  assert.equal((await evaluate(`window.request('logout-all')`)).status, 200)
  assert.equal((await cookies()).length, 0)
  assert.equal((await evaluate(`window.request('refresh')`)).status, 401)
  console.log('PASS: browser HttpOnly, same-site cross-port credentials, scope, reload/refresh rotation, authenticated request, logout and logout-all deletion.')
} finally {
  ws?.close()
  if(target) await fetch(`http://localhost:${port}/json/close/${target.id}`)
  await Promise.all([api, frontend].map(server => new Promise(resolve => {
    server.close(resolve)
    server.closeAllConnections()
  })))
}

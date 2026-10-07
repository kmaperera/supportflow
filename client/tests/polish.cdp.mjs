import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const port = process.env.KEYBOARD_CDP_PORT || '9223'
const base = 'http://127.0.0.1:5173/tests/polish.browser.html'
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${base}`, { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
let seq = 0
const pending = new Map(), warnings = []
ws.onmessage = event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.consoleAPICalled' && ['warning', 'error'].includes(message.params.type)) warnings.push(message.params.args.map(arg => arg.value || arg.description).join(' '))
  if (message.method === 'Runtime.exceptionThrown') warnings.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
  if (!message.id) return
  const item = pending.get(message.id); pending.delete(message.id)
  if (message.error) item.reject(Error(message.error.message)); else item.resolve(message.result)
}
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw Error(result.result.description)
  return result.result.value
}
const routes = ['/login', '/change-password', '/employee', '/employee/tickets/new', '/employee/tickets', '/employee/tickets/1', '/employee/knowledge-base', '/employee/knowledge-base/1', '/employee/notifications', '/employee/profile', '/technician', '/technician/tickets/assigned', '/technician/tickets/unassigned', '/technician/tickets/1', '/technician/workload', '/technician/notifications', '/technician/profile', '/admin', '/admin/users', '/admin/users/new', '/admin/technicians', '/admin/technicians/workload', '/admin/categories', '/admin/categories/new', '/admin/tickets', '/admin/tickets/1', '/admin/sla', '/admin/knowledge-base', '/admin/knowledge-base/articles/new', '/admin/analytics', '/admin/reports', '/admin/audit-logs', '/admin/profile']
const checkedRoutes = process.env.POLISH_ROUTES ? process.env.POLISH_ROUTES.split(',') : routes
const failures = []
try {
  await send('Runtime.enable'); await send('Page.bringToFront')
  for (const route of checkedRoutes) {
    await send('Page.navigate', { url: `${base}?route=${encodeURIComponent(route)}` })
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate('Boolean(document.querySelector("h1") && window.showPolishToast)')) break
      await wait(100)
    }
    await wait(250)
    if (route === '/admin/reports') { await evaluate('document.querySelector("button[type=submit]").click()'); await wait(120) }
    if (route === '/admin/audit-logs') await evaluate('document.querySelectorAll("details").forEach(d=>d.open=true)')
    const alerts = await evaluate('[...document.querySelectorAll("[role=alert]")].map(e=>e.textContent)')
    if (alerts.length) failures.push({ route, alerts })
    for (const width of [320, 375, 430, 768, 1024, 1440]) for (const dark of [false, true]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false })
      await evaluate(`document.documentElement.classList.toggle('dark', ${dark})`)
      await wait(35)
      const overflow = await evaluate('document.documentElement.scrollWidth > innerWidth')
      if (overflow) failures.push({ route, width, dark, overflow: await evaluate('[...document.querySelectorAll("main, header, .layout-panel, .layout-table, input, select, button")].filter(e=>e.getClientRects().length&&e.getBoundingClientRect().right>innerWidth+1&&!e.closest(".layout-table")).map(e=>({tag:e.tagName,text:e.textContent.slice(0,60),width:e.getBoundingClientRect().width}))') })
      const cursors = await evaluate('[...document.querySelectorAll("button")].filter(e=>e.getClientRects().length&&!e.disabled&&getComputedStyle(e).cursor!=="pointer").map(e=>e.textContent)')
      if (cursors.length) failures.push({ route, cursors })
      if (width === 375 && dark && ['/technician/tickets/1', '/admin/analytics', '/admin/audit-logs', '/employee/profile'].includes(route)) {
        await mkdir('node_modules/.cache/polish-shots', { recursive: true })
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
        await writeFile(`node_modules/.cache/polish-shots/${route.replaceAll('/', '_')}.png`, Buffer.from(shot.data, 'base64'))
      }
    }
    console.log(`Checked ${route}`)
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 1, mobile: false })
  await evaluate('window.showPolishToast()'); await wait(100)
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'long toast wraps')
  assert.equal(await evaluate('document.querySelector("button[aria-label^=Dismiss]").getBoundingClientRect().height'), 44)
  assert.deepEqual(failures, [], 'route/viewport failures')
  assert.deepEqual([...new Set(warnings)], [], 'frontend console warnings')
  console.log(`PASS: ${checkedRoutes.length} routes × six widths × Light/Dark; long-content overflow, cursors, tables, report generation, toast targets and console checks.`)
} finally { ws.close(); await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`) }

// Existing safe browser fixture + actual viewer controls; no production API writes.
import assert from 'node:assert/strict'
const port = process.env.KEYBOARD_CDP_PORT || '9223'
const url = 'http://127.0.0.1:5173/tests/polish.browser.html?route=%2Fadmin%2Faudit-logs'
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${url}`, { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
let sequence = 0
const pending = new Map()
ws.onmessage = event => {
  const result = JSON.parse(event.data)
  if (!result.id) return
  const call = pending.get(result.id); pending.delete(result.id)
  if (result.error) call.reject(Error(result.error.message)); else call.resolve(result.result)
}
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw Error('Browser evaluation failed')
  return result.result.value
}
async function until(expression) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(expression)) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  assert.fail('Audit viewer did not reach expected state')
}
async function set(field, text) {
  await evaluate(`document.getElementById('audit-${field}').focus(); document.getElementById('audit-${field}').select()`)
  await send('Input.insertText', { text })
}
const submit = () => evaluate('document.querySelector("form").requestSubmit()')
const clear = () => evaluate('document.querySelector("form button[type=button]").click()')
try {
  await send('Runtime.enable')
  await until('Boolean(document.querySelector("tbody"))')
  await evaluate(`(async () => {
    const { default: api } = await import('/src/api/axios.js');
    const original = api.defaults.adapter;
    window.auditQueries = [];
    api.defaults.adapter = async config => {
      if (config.url !== '/audit-logs') return original(config);
      window.auditQueries.push({ ...config.params });
      if (config.params.action === 'NOT_REAL') throw Object.assign(new Error('Invalid audit query'), { isAxiosError: true, response: { status: 400, data: { success: false, message: 'Invalid audit-log query', errors: [] } } });
      const response = await original(config);
      if (config.params.search === 'empty-fixture') response.data.data = { logs: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } };
      else if (config.params.action === 'LOGIN_SUCCESS') {
        const page = config.params.page;
        response.data.data.logs = response.data.data.logs.map(row => ({ ...row, id: String(page), action: 'LOGIN_SUCCESS' }));
        response.data.data.pagination = { page, currentPage: page, limit: 25, total: 26, totalItems: 26, totalRecords: 26, totalPages: 2, hasNextPage: page < 2, hasPreviousPage: page > 1 };
      }
      return response;
    };
  })()`)
  await set('action', 'LOGIN_SUCCESS'); await submit()
  await until(`Boolean(document.querySelector('button[aria-label="Go to page 2"]'))`)
  assert.equal(await evaluate('window.auditQueries.at(-1).action'), 'LOGIN_SUCCESS')
  await evaluate(`document.querySelector('button[aria-label="Go to page 2"]').click()`)
  await until('window.auditQueries.at(-1).page === 2 && document.querySelector("button[aria-current=page]")?.textContent === "2"')
  await clear(); await until('Boolean(document.querySelector("tbody")) && !window.auditQueries.at(-1).action')
  await set('search', 'empty-fixture'); await submit()
  await until('document.body.textContent.includes("No audit logs match your current filters.")')
  assert.equal(await evaluate('document.querySelector("form button[type=button]").disabled'), false)
  await clear(); await until('Boolean(document.querySelector("tbody")) && !window.auditQueries.at(-1).search')
  await set('action', 'NOT_REAL'); await submit()
  await until('document.body.textContent.includes("Invalid audit-log query")')
  assert.equal(await evaluate('document.body.textContent.includes("Unable to load audit logs")'), true)
  await clear(); await until('Boolean(document.querySelector("tbody")) && !window.auditQueries.at(-1).action')
  await evaluate('document.querySelectorAll("details").forEach(node => node.open=true)')
  assert.equal(await evaluate('Boolean(document.querySelector("pre")?.textContent.includes("sessionsRevoked"))'), true)
  console.log('PASS: Admin viewer initial load, action filter, shared pagination, empty/error states, Clear Filters recovery and structured metadata.')
} finally { ws.close(); await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`) }

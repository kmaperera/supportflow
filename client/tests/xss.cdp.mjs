import assert from 'node:assert/strict'
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

const routes = ['/employee/tickets','/employee/tickets/1','/technician/tickets/assigned','/technician/tickets/unassigned','/technician/tickets/1','/admin/tickets','/admin/tickets/1','/employee/knowledge-base','/employee/knowledge-base/1','/admin/knowledge-base','/admin/categories','/admin/users','/employee/profile','/employee/notifications','/technician/notifications','/admin/notifications','/admin/reports','/admin/audit-logs','/admin/analytics'];
try {
 await send('Runtime.enable'); await send('Page.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.__xss=0; window.alert=()=>{window.__xss++}'});
 for (const route of routes) {
  await send('Page.navigate',{url:base+'?xss=1&route='+encodeURIComponent(route)});
  for(let i=0;i<100;i++){if(await evaluate('Boolean(window.showPolishToast && document.querySelector("main h1"))'))break;await wait(100)}
  await wait(300);
  if(route==='/admin/reports'){await evaluate('document.querySelector("button[type=submit]").click()');await wait(150)}
  if(route==='/admin/audit-logs')await evaluate('document.querySelectorAll("details").forEach(e=>e.open=true)');
  for(let i=0;i<100;i++){if(await evaluate('document.querySelector("main").textContent.includes("<script>window.__xss=1</script>")'))break;await wait(100)}
  assert.equal(await evaluate('document.querySelector("main").textContent.includes("<script>window.__xss=1</script>")'),true,route+' renders payload literally');
  assert.equal(await evaluate('document.querySelector("main").textContent.includes("O\'Connor C++ <5 minutes A & B")'),true,route+' preserves legitimate text');
  assert.equal(await evaluate('window.__xss'),0,route+' no execution');
  assert.equal(await evaluate('document.querySelectorAll("#root script,dialog script,img,iframe,object,embed,[onerror],[onload]").length'),0,route+' no injected elements');
  assert.equal(await evaluate('[...document.querySelectorAll("a[href]")].some(e=>/^(javascript|vbscript|data):/i.test(e.getAttribute("href")))'),false);
  await evaluate('window.showPolishToast()'); await wait(80);
  assert.equal(await evaluate('[...document.querySelectorAll("[role=status]")].some(e=>e.textContent.includes("<img"))'),true,'toast text');
  if(route==='/employee/knowledge-base/1')assert.equal(await evaluate('[...document.querySelectorAll("main p")].some(e=>e.textContent.includes("<script>")&&getComputedStyle(e).whiteSpace==="pre-wrap")'),true);
  console.log('PASS '+route);
 }
 await evaluate('window.showXssDialog()');await wait(100);
 assert.equal(await evaluate('document.querySelector("dialog").textContent.includes("<script>")'),true);
 assert.equal(await evaluate('window.__xss'),0);
 assert.deepEqual([...new Set(warnings)],[],'console warnings');
 console.log('PASS: cross-role plain text, legitimate text, notifications/toasts, dialog, errors, reports/audit/charts and URL props; no payload execution.');
} finally {ws.close();await fetch('http://127.0.0.1:'+port+'/json/close/'+target.id)}

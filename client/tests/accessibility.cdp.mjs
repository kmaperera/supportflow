import assert from 'node:assert/strict'

// Run against the local Vite server and an isolated Edge/Chromium CDP instance.
const port = process.env.KEYBOARD_CDP_PORT || '9223'
const base = 'http://127.0.0.1:5173/tests/accessibility.browser.html'
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${base}`, { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
let seq = 0
const pending = new Map()
ws.onmessage = event => {
  const message = JSON.parse(event.data)
  if (!message.id) return
  const item = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) item.reject(Error(message.error.message)); else item.resolve(message.result)
}
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }))
})
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw Error(result.result.description)
  return result.result.value
}
const tree = async () => (await send('Accessibility.getFullAXTree')).nodes.filter(node => !node.ignored)
const role = (nodes, value) => nodes.filter(node => node.role?.value === value)
const property = (node, name) => node.properties?.find(item => item.name === name)?.value.value
const focus = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`)
async function contrast(selector) {
  return evaluate(`(() => {
    const context = document.createElement('canvas').getContext('2d');
    const rgb = color => { context.clearRect(0,0,1,1); context.fillStyle=color; context.fillRect(0,0,1,1); return [...context.getImageData(0,0,1,1).data]; };
    const luminance = color => color.slice(0,3).map(value => { const n=value/255; return n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4; }).reduce((sum,n,i)=>sum+n*[0.2126,0.7152,0.0722][i],0);
    return [...document.querySelectorAll(${JSON.stringify(selector)})].map(element => {
      let ancestor=element,background;
      while(ancestor){background=rgb(getComputedStyle(ancestor).backgroundColor);if(background[3]===255)break;ancestor=ancestor.parentElement;}
      const a=luminance(rgb(getComputedStyle(element).color)),b=luminance(background);
      return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
    });
  })()`)
}
async function key(value) {
  const codes = { Enter: 13, ' ': 32, Escape: 27, ArrowDown: 40, ArrowRight: 39, ArrowLeft: 37, Home: 36, End: 35 }
  const params = { key: value, code: value === ' ' ? 'Space' : value, windowsVirtualKeyCode: codes[value] }
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params, ...(value === 'Enter' ? { text: '\r' } : value === ' ' ? { text: ' ' } : {}) })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }); await wait(80)
}
async function load(page, accountRole = 'admin') {
  await send('Page.navigate', { url: `${base}?page=${page}&role=${accountRole}` })
  for (let count = 0; count < 100; count++) {
    if (await evaluate('Boolean(document.querySelector("h1"))')) break
    await wait(100)
  }
  await wait(150)
}
async function common() {
  const nodes = await tree()
  assert.equal(role(nodes, 'main').length, 1, 'single primary landmark')
  assert.equal(role(nodes, 'heading').filter(node => property(node, 'level') === 1).length, 1, 'one exposed h1')
  for (const node of nodes.filter(node => ['button', 'textbox', 'combobox', 'searchbox'].includes(node.role?.value))) assert.ok(node.name?.value, `named ${node.role.value}`)
  assert.equal(await evaluate('document.title'), `${await evaluate('document.querySelector("h1").textContent')} | SupportFlow`)
  const missing = await evaluate(`Array.from(document.querySelectorAll('[aria-labelledby],[aria-describedby],[aria-controls],[aria-activedescendant]')).flatMap(element => ['aria-labelledby','aria-describedby','aria-controls','aria-activedescendant'].flatMap(attribute => (element.getAttribute(attribute)||'').split(/\\s+/).filter(id => id && !document.getElementById(id))))`)
  assert.deepEqual(missing, [], 'all ARIA references resolve')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'no viewport overflow')
  return nodes
}
async function responsivePage() {
  for (const width of [375, 768, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false })
    for (const dark of [false, true]) {
      await evaluate(`document.documentElement.classList.toggle('dark', ${dark})`)
      await common()
    }
  }
}
try {
  await send('Page.bringToFront')
  for (const accountRole of ['employee', 'technician', 'admin']) {
    await load('shared', accountRole)
    for (const width of [375, 768, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false })
      for (const dark of [false, true]) {
        await evaluate(`document.documentElement.classList.toggle('dark', ${dark})`)
        const nodes = await common()
        assert.equal(role(nodes, 'dialog').length, 0, 'closed dialog hidden')
        assert.equal(role(nodes, 'listbox').length, 0, 'closed popup hidden')
        assert.equal(role(nodes, 'navigation').length, width < 1024 ? 0 : 1, 'collapsed sidebar excluded')
        assert.ok(role(nodes, 'link').some(node => node.name.value === 'SF-001 Printer offline Open'), 'meaningful card link')
        assert.ok(role(nodes, 'article').some(node => node.name.value === 'Internal note by Sam (Admin)'))
        assert.equal(role(nodes, 'status').length, 1, 'one skeleton loading region')
        assert.equal(property(role(nodes, 'status')[0], 'live'), 'polite')
        assert.equal(role(nodes, 'alert').length, 1, 'query error alert')
        assert.ok((await contrast('[data-contrast] > span')).every(ratio => ratio >= 4.5), 'badge text contrast')
      }
    }
  }
  await focus('[role=combobox]'); await key('ArrowDown')
  let nodes = await common()
  const combo = role(nodes, 'combobox')[0]
  assert.equal(combo.name.value, 'Select technician')
  assert.equal(property(combo, 'expanded'), true); assert.equal(property(combo, 'required'), true)
  assert.ok(await evaluate('document.getElementById(document.querySelector("[role=combobox]").getAttribute("aria-activedescendant"))?.textContent.includes("Alex")'))
  await key('Enter'); await key(' ')
  assert.equal(property(role(await tree(), 'option').find(node => node.name.value.includes('Alex')), 'selected'), true)
  await key('Escape'); await focus('#confirmation'); await key('Enter')
  nodes = await tree()
  const dialog = role(nodes, 'dialog')[0]
  assert.equal(dialog.name.value, 'Deactivate user?')
  assert.equal(dialog.description.value, 'Alex will no longer be able to sign in.')
  assert.equal(property(dialog, 'modal'), true)
  await key('Escape')
  await focus('a[href="/next"]'); await key('Enter')
  assert.equal(await evaluate('document.title'), 'Next page | SupportFlow')
  assert.equal(await evaluate('document.activeElement.id'), 'main-content')

  await load('kb'); await responsivePage()
  await focus('[role=tab]'); await key('End')
  assert.equal(await evaluate('document.activeElement.textContent'), 'KB Categories')
  assert.equal(property(role(await tree(), 'tab')[0], 'selected'), true, 'arrows do not fetch/activate a new panel')
  await key('Enter'); nodes = await common()
  assert.equal(role(nodes, 'tabpanel').length, 1)
  assert.equal(role(nodes, 'tabpanel')[0].name.value, 'KB Categories')
  assert.equal(property(role(nodes, 'tab')[1], 'selected'), true)
  await key('Home'); await key(' ')
  assert.equal(role(await tree(), 'tabpanel')[0].name.value, 'KB Articles')
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.startsWith('Archive')).focus()`)
  await key('Enter'); await evaluate(`document.querySelector('dialog[open] button:last-child').focus()`); await key('Enter')
  assert.equal(await evaluate('document.querySelectorAll("[role=alert]").length'), 1, 'mutation failure is not duplicated behind dialog')
  await key('Escape')

  await load('form'); await responsivePage(); await focus('button[type=submit]'); await key('Enter')
  nodes = await common()
  const firstName = role(nodes, 'textbox').find(node => node.name.value === 'First name')
  assert.ok(firstName, 'required mark not part of name')
  assert.equal(property(firstName, 'required'), true)
  assert.equal(property(firstName, 'invalid'), 'true')
  assert.ok(firstName.description?.value, 'field error described')
  assert.equal(role(nodes, 'alert').length, 0, 'field errors do not compete as alerts')
  assert.equal(await evaluate('document.activeElement.id'), 'create-user-firstName')

  await load('notifications'); await responsivePage()
  for (const dark of [false, true]) {
    await evaluate(`document.documentElement.classList.toggle('dark', ${dark})`)
    assert.ok((await contrast('li time')).every(ratio => ratio >= 4.5), 'notification timestamp contrast')
  }
  nodes = await tree()
  assert.ok(role(nodes, 'button').some(node => /View Ticket\s*:\s*Printer update/.test(node.name.value)), JSON.stringify(role(nodes, 'button').map(node => node.name.value)))
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.startsWith('Mark as read')).focus()`)
  await key('Enter'); nodes = await common()
  assert.equal(role(nodes, 'status').length, 1, 'one mark-read toast, no live list')
  assert.equal(property(role(nodes, 'status')[0], 'live'), 'polite')
  assert.ok(role(nodes, 'button').some(node => node.name.value === 'Dismiss success notification'))

  await load('analytics'); await responsivePage(); nodes = await common()
  assert.ok(role(nodes, 'region').some(node => node.name.value === 'Ticket status distribution data'))
  assert.ok(role(nodes, 'region').some(node => node.name.value === 'Created-ticket trend data'))
  assert.ok(role(nodes, 'StaticText').some(node => node.name.value === '10'))
  assert.equal(role(nodes, 'graphics-document').length, 0, 'chart SVG excluded in favor of equivalent values')
  assert.equal(await evaluate('Array.from(document.querySelectorAll("thead th")).every(th => th.scope === "col")'), true)
  assert.equal(await evaluate('document.querySelectorAll("table caption").length'), 1)

  for (const width of [375, 768, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false })
    await load('login'); await common()
  }
  console.log('Accessibility tree passed: 18 role-shell and 24 Admin page viewport/theme combinations plus responsive login; names, landmarks, hidden content, loading/errors, combo, dialog, KB tabs, form errors, notifications, chart alternatives, route titles, and badge/timestamp contrast.')
} finally { ws.close(); await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`) }

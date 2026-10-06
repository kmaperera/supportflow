import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const port = process.env.KEYBOARD_CDP_PORT || '9223'
const base = 'http://127.0.0.1:5173/tests/mobileNavigation.browser.html'
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${base}`, { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
let seq = 0
const pending = new Map()
ws.onmessage = event => {
  const message = JSON.parse(event.data), item = pending.get(message.id)
  if (!item) return
  pending.delete(message.id); clearTimeout(item.timeout)
  if (message.error) item.reject(Error(message.error.message)); else item.resolve(message.result)
}
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq
  const timeout = setTimeout(() => { pending.delete(id); reject(Error(`Timed out: ${method}`)) }, 15000)
  pending.set(id, { resolve, reject, timeout }); ws.send(JSON.stringify({ id, method, params }))
})
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw Error(result.result.description)
  return result.result.value
}
const focus = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`)
async function key(value, shift = false) {
  const codes = { Enter: 13, ' ': 32, Escape: 27, Tab: 9 }
  const params = { key: value, code: value === ' ' ? 'Space' : value, windowsVirtualKeyCode: codes[value], modifiers: shift ? 8 : 0 }
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params, ...(value === 'Enter' ? { text: '\r' } : value === ' ' ? { text: ' ' } : {}) })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }); await wait(60)
}
const menu = 'header button[aria-controls]'
const drawer = 'dialog.mobile-navigation'
const isOpen = () => evaluate(`document.querySelector('${drawer}').open`)
const size = async (width, height = 850) => { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await wait(80) }
async function load(role) {
  await send('Page.navigate', { url: `${base}?role=${role}` })
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate('Boolean(window.navigateFixture && document.querySelector("header button[aria-controls]"))')) return
    await wait(100)
  }
  throw Error(`Fixture did not load: ${role}`)
}
async function open() { await focus(menu); await key('Enter'); await wait(210); assert.equal(await isOpen(), true) }
async function closed({ restore = true } = {}) {
  await wait(60)
  assert.equal(await isOpen(), false)
  assert.equal(await evaluate('document.body.style.overflow'), '')
  assert.equal(await evaluate('document.documentElement.style.overflow'), '')
  assert.equal(await evaluate(`document.querySelector('${menu}').getAttribute('aria-expanded')`), 'false')
  if (restore) assert.equal(await evaluate(`document.activeElement === document.querySelector('${menu}')`), true, 'focus restored to menu')
}
const ax = async () => (await send('Accessibility.getFullAXTree')).nodes.filter(node => !node.ignored)
async function screenshot(name) {
  await mkdir('node_modules/.cache/mobile-navigation-shots', { recursive: true })
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(`node_modules/.cache/mobile-navigation-shots/${name}.png`, Buffer.from(data, 'base64'))
}
try {
  await send('Page.bringToFront')
  for (const role of ['employee', 'technician', 'admin']) {
    await size(375); await load(role)
    for (const width of [320, 375, 430, 768]) for (const dark of [false, true]) {
      await size(width)
      if (await evaluate('document.documentElement.classList.contains("dark")') !== dark) { await focus('header button[aria-label^="Switch to"]'); await key('Enter') }
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'closed width')
      assert.equal(await evaluate('getComputedStyle(document.querySelector("aside")).display'), 'none')
      assert.equal((await ax()).filter(node => node.role.value === 'navigation').length, 0, 'closed nav hidden')
      assert.equal(await evaluate(`(() => { const b=document.querySelector('${menu}').getBoundingClientRect(),t=document.querySelector('header button[aria-label^="Switch to"]').getBoundingClientRect();return b.height>=44&&b.right<t.left; })()`), true, 'compact targets do not collide')
      await evaluate('window.scrollTo(0,300)')
      assert.equal(await evaluate('document.querySelector("header").getBoundingClientRect().top'), 0, 'sticky header')
      const scroll = await evaluate('scrollY')
      await open()
      assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'Close navigation menu')
      assert.equal(await evaluate(`document.querySelector('${menu}').getAttribute('aria-expanded')`), 'true')
      assert.equal(await evaluate('document.body.style.overflow'), 'hidden')
      assert.equal(await evaluate(`document.querySelector('${drawer}').getBoundingClientRect().left`), 0)
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'overlay does not expand page')
      const nodes = await ax()
      assert.equal(nodes.filter(node => node.role.value === 'navigation').length, 1, 'only drawer navigation exposed')
      assert.equal(nodes.filter(node => node.role.value === 'dialog').length, 1)
      assert.equal(nodes.filter(node => node.role.value === 'main').length, 0, 'background inert')
      const paths = await evaluate(`[...document.querySelectorAll('${drawer} nav a')].map(a=>a.getAttribute('href'))`)
      assert.ok(paths.every(path => path === `/${role}` || path.startsWith(`/${role}/`)), 'no role leakage')
      assert.ok(paths.includes(`/${role}/profile`), 'direct profile access')
      assert.equal(await evaluate(`document.querySelectorAll('${drawer} nav a[aria-current=page]').length`), 1)
      await key('Tab', true)
      assert.equal(await evaluate('document.activeElement.textContent'), 'Logout', 'reverse trap and reachable footer')
      assert.equal(await evaluate('document.activeElement.getBoundingClientRect().bottom <= innerHeight'), true)
      await key('Tab')
      assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'Close navigation menu', 'forward trap')
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: width - 5, y: 200, deltaX: 0, deltaY: 400 })
      await wait(80); assert.equal(await evaluate('scrollY'), scroll, 'background cannot scroll')
      await key('Escape'); await closed()
      assert.equal(await evaluate('scrollY'), scroll, 'scroll position preserved')
    }
    await size(375, 320); await open()
    await key('Tab', true)
    assert.equal(await evaluate('document.activeElement.textContent'), 'Logout')
    assert.equal(await evaluate('document.activeElement.getBoundingClientRect().bottom <= innerHeight'), true, 'landscape logout visible')
    if (role === 'admin') await screenshot('admin-dark-short-drawer')
    await size(768, 320)
    assert.equal(await isOpen(), true, 'rotation within mobile breakpoint keeps drawer usable')
    assert.equal(await evaluate('document.activeElement.getBoundingClientRect().bottom <= innerHeight'), true, 'landscape footer remains reachable')
    await key('Escape'); await closed()
    await size(375, 320)
    await open()
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 370, y: 180, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 370, y: 180, button: 'left', clickCount: 1 })
    await closed()
    await open(); await key('Enter'); await closed() // focused close button
    await open(); await focus(`${drawer} nav li:nth-child(2) a`); await key('Enter'); await closed({ restore: false })
    assert.equal(await evaluate('document.activeElement.id'), 'main-content', 'route focus wins after navigation')
    await open(); await evaluate(`window.navigateFixture('/${role}/profile')`); await closed({ restore: false })
    await open(); await size(1024, 800); await closed({ restore: false })
    assert.equal((await ax()).filter(node => node.role.value === 'navigation').length, 1, 'persistent desktop sidebar only')
    assert.equal(await evaluate(`document.querySelector('${menu}').getClientRects().length`), 0, 'desktop trigger hidden')
    assert.equal(await evaluate('document.querySelector("aside").getBoundingClientRect().width'), 256, 'desktop sidebar width preserved')
    assert.equal(await evaluate('document.querySelector("main").getBoundingClientRect().left'), 256)
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
    await size(375, 700); assert.equal(await isOpen(), false, 'resize does not reopen drawer')
    await open(); await key('Tab', true); await key('Enter'); await closed({ restore: false })
    assert.equal(await evaluate('window.fixture.logouts'), 1, 'logout behavior retained once')
    console.log(`PASS ${role}: 320/375/430/768 Light/Dark, scrolling, focus, backdrop, routes, 1024 desktop and logout.`)
  }
  await size(375, 700); await load('admin'); await open()
  await evaluate('window.openConfirmation()'); await wait(100)
  assert.equal((await ax()).filter(node => node.role.value === 'dialog').length, 1, 'only top modal exposed')
  assert.equal(await evaluate('document.activeElement.textContent'), 'Cancel')
  await key('Tab', true); assert.equal(await evaluate('document.activeElement.textContent'), 'Confirm Action')
  await evaluate("window.navigateFixture('/admin/profile')"); await wait(100)
  assert.equal(await isOpen(), false)
  assert.equal(await evaluate('document.body.style.overflow'), 'hidden', 'confirmation retains shared scroll lock')
  await key('Escape'); assert.equal(await evaluate('document.body.style.overflow'), '')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await open(); assert.equal(await evaluate(`getComputedStyle(document.querySelector('${drawer}')).animationName`), 'none')
  await key('Escape')
  await evaluate("document.body.style.overflow='scroll';document.documentElement.style.overflow='auto'")
  await open(); await evaluate('window.unmountFixture()'); await wait(60)
  assert.equal(await evaluate('document.body.style.overflow'), 'scroll', 'unmount restores original body style')
  assert.equal(await evaluate('document.documentElement.style.overflow'), 'auto', 'unmount restores original root style')
  await size(320, 700); await load('employee')
  if (await evaluate('document.documentElement.classList.contains("dark")')) { await focus('header button[aria-label^="Switch to"]'); await key('Enter') }
  await screenshot('employee-light-320-header')
  console.log('PASS: modal stacking, shared scroll lock, reduced motion, unmount cleanup, and screenshots.')
} finally {
  ws.close()
  for (const item of pending.values()) clearTimeout(item.timeout)
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`)
}

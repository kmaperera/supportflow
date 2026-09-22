import assert from 'node:assert/strict'
import { saveAttachment, openAttachment } from '../src/pages/employee/attachmentDownload.js'

const revoked = []
let timer, interval, removed = false, clicked = false
URL.createObjectURL = () => 'blob:test'
URL.revokeObjectURL = url => revoked.push(url)
globalThis.setTimeout = (callback, delay) => { assert.equal(delay, 60000); timer = callback }
globalThis.setInterval = callback => { interval = callback; return 1 }
globalThis.clearInterval = id => assert.equal(id, 1)
const anchor = { click() { clicked = true }, remove() { removed = true } }
globalThis.document = { createElement: () => anchor, body: { appendChild() {} } }
saveAttachment(new Blob(['file']), 'original name.pdf')
assert.equal(anchor.download, 'original name.pdf')
assert.equal(anchor.href, 'blob:test')
assert.ok(clicked && removed)
assert.equal(revoked.length, 0)
timer()
assert.deepEqual(revoked, ['blob:test'])
const preview = { closed: false, location: { replace(url) { assert.equal(url, 'blob:test') } } }
openAttachment(new Blob(['preview']), preview)
interval()
assert.equal(revoked.length, 1)
preview.closed = true
interval()
assert.equal(revoked.length, 2)
console.log('Original download filename, deferred URL cleanup and separate preview lifecycle passed.')

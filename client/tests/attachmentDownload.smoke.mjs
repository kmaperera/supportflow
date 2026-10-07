import assert from 'node:assert/strict'
import { saveAttachment, openAttachment } from '../src/pages/employee/attachmentDownload.js'

const revoked = []
let timer, interval, removed = false, clicked = false
let previewResource
URL.createObjectURL = resource => { previewResource = resource; return 'blob:test' }
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
openAttachment(new Blob(['preview'], { type: 'text/plain' }), preview)
interval()
assert.equal(revoked.length, 1)
preview.closed = true
interval()
assert.equal(revoked.length, 2)
for (const type of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'application/octet-stream', '']) {
  assert.throws(() => openAttachment(new Blob(['<script>alert(1)</script>'], { type }), preview), /download-only/)
}
const csvText = '<script>alert(1)</script>\nO\'Connor,C++,<5 minutes,A & B'
openAttachment(new Blob([csvText], { type: 'text/csv' }), preview)
assert.equal(previewResource.type, 'text/plain')
assert.equal(await previewResource.text(), csvText)
console.log('Original download filename, deferred URL cleanup and separate preview lifecycle passed.')

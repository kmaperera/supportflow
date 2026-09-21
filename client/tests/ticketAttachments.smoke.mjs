import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: api } = await server.ssrLoadModule('/src/api/axios.js')
  const { getTicketAttachments, uploadTicketAttachment, downloadTicketAttachment } = await server.ssrLoadModule('/src/api/attachmentApi.js')
  const { validateAttachment } = await server.ssrLoadModule('/src/pages/employee/attachmentFormatting.js')
  const file = new File(['hello'], 'example.txt', { type: 'text/plain' })
  assert.equal(validateAttachment(file), null)
  assert.ok(validateAttachment(null))
  assert.ok(validateAttachment({ name: 'bad.exe', type: 'application/octet-stream', size: 10 }))
  assert.ok(validateAttachment({ name: 'big.txt', type: 'text/plain', size: 10485761 }))
  assert.ok(validateAttachment({ name: 'empty.txt', type: 'text/plain', size: 0 }))
  const attachment = { id: 7, originalName: file.name, downloadPath: '/api/v1/tickets/42/attachments/7/download' }
  api.defaults.adapter = async config => {
    if (config.method === 'post') {
      assert.equal(config.url, '/tickets/42/attachments')
      assert.deepEqual([...config.data.keys()], ['attachment'])
      assert.equal(config.data.get('attachment').name, file.name)
      return { config, status: 201, headers: {}, data: { success: true, data: { attachment } } }
    }
    if (config.responseType === 'blob') {
      assert.equal(config.url, '/tickets/42/attachments/7/download')
      return { config, status: 200, headers: {}, data: new Blob(['hello']) }
    }
    assert.equal(config.url, '/tickets/42/attachments')
    return { config, status: 200, headers: {}, data: { success: true, data: { attachments: [attachment] } } }
  }
  assert.deepEqual(await getTicketAttachments('42'), [attachment])
  assert.deepEqual(await uploadTicketAttachment('42', file), attachment)
  assert.equal(await (await downloadTicketAttachment('42', attachment)).text(), 'hello')
  await assert.rejects(() => downloadTicketAttachment('42', { ...attachment, downloadPath: 'https://untrusted.test/file' }), /Invalid attachment download path/)
  console.log('Attachment restrictions, multipart field, list/upload/download contracts and download path validation passed.')
} finally { await server.close() }

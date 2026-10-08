const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateAttachmentFile } = require('../src/middleware/attachmentValidation');
const { ALLOWED_ATTACHMENT_TYPES } = require('../src/constants/attachmentTypes');
const makeFile = (name, mime, buffer = Buffer.from('harmless fixture')) => ({ originalname: name, mimetype: mime, buffer, size: buffer.length });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

test('metadata rejects unsupported final extensions, mismatched MIME and unsafe names', () => {
  for (const extension of ['exe','bat','cmd','com','msi','ps1','sh','php','jsp','asp','aspx','js','mjs','html','htm','svg','zip','rar','7z','docm','xlsm']) {
    assert.throws(() => validateAttachmentFile(makeFile(`test.pdf.${extension}`, 'application/pdf')), { statusCode: 415 });
  }
  for (const name of ['.env', '.htaccess', 'no-extension', 'x\r\n.txt', 'x\0.txt', `${'a'.repeat(255)}.txt`]) {
    assert.throws(() => validateAttachmentFile(makeFile(name, 'text/plain')), { statusCode: 422 });
  }
  assert.throws(() => validateAttachmentFile(makeFile('photo.png', 'text/plain', png)), { statusCode: 415 });
  for (const name of ['../../report.txt', '..\\..\\report.txt']) {
    const file = makeFile(name, 'text/plain');
    validateAttachmentFile(file);
    assert.equal(file.originalname, 'report.txt');
  }
  const textName = makeFile('<img src=x onerror=alert(1)>.txt', 'text/plain');
  validateAttachmentFile(textName);
  assert.equal(textName.originalname, '<img src=x onerror=alert(1)>.txt');
});

test('PDF and raster signatures reject content mismatches; existing document mappings remain explicit', () => {
  for (const extension of ['pdf','png','jpg','jpeg','webp']) {
    assert.throws(() => validateAttachmentFile(makeFile(`test.${extension}`, ALLOWED_ATTACHMENT_TYPES[`.${extension}`][0])), { statusCode: 415 });
  }
  validateAttachmentFile(makeFile('photo.PNG', 'image/png', png));
  validateAttachmentFile(makeFile('photo.jpg', 'image/jpeg', Buffer.from([255,216,255,224])));
  validateAttachmentFile(makeFile('photo.webp', 'image/webp', Buffer.from('RIFF1234WEBP')));
  // Text and Office retain metadata checks; these are not document parsers or malware scans.
  for (const ext of ['.txt','.csv','.doc','.docx','.xls','.xlsx']) {
    for (const mime of ALLOWED_ATTACHMENT_TYPES[ext]) validateAttachmentFile(makeFile(`fixture${ext}`, mime));
  }
  assert.throws(() => validateAttachmentFile(makeFile('empty.txt', 'text/plain', Buffer.alloc(0))), { statusCode: 422 });
  const incorrectSize = makeFile('size.txt', 'text/plain'); incorrectSize.size++;
  assert.throws(() => validateAttachmentFile(incorrectSize), { statusCode: 422 });
});

test('real upload routes bound multipart input before storage and preserve PDF/image workflows', async (t) => {
  const configPath = require.resolve('../src/config/cloudinary');
  require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: { utils: { private_download_url: () => "https://example.test/signed" } } };
  const authPath = require.resolve('../src/middleware/authenticate');
  let user = { id: 3, role: 'EMPLOYEE' };
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports(req, res, next) {
    if (!req.headers.authorization) return res.status(401).json({ success: false });
    req.user = user; next();
  } };
  const tickets = require('../src/modules/tickets/ticket.repository');
  const comments = require('../src/modules/tickets/ticketComment.repository');
  const repository = require('../src/modules/tickets/ticketAttachment.repository');
  const cloud = require('../src/services/cloudinaryUpload.service');
  const ticket = { id: 1, ticket_number: 'TKT-1', created_by: 3, assigned_to: 7, status: 'IN_PROGRESS' };
  const read = t.mock.method(tickets, 'findById', async () => ticket);
  t.mock.method(comments, 'findById', async () => ({ id: 1, ticket_id: 1, comment_type: 'PUBLIC' }));
  let saved;
  const upload = t.mock.method(cloud, 'uploadAttachmentBuffer', async ({ buffer }) => ({ publicId: 'fixture', secureUrl: 'https://example.test/fixture', resourceType: 'raw', bytes: buffer.length }));
  const insert = t.mock.method(repository, 'createAttachment', async (data) => { saved = data; return 1; });
  t.mock.method(repository, 'findById', async () => ({ id: 1, ticket_id: 1, original_name: saved.originalName, mime_type: saved.mimeType, file_size: saved.fileSize, uploaded_by: saved.uploadedBy }));
  t.mock.method(repository, 'findByTicketId', async () => [{ id: 1, ticket_id: 1, original_name: saved.originalName }]);
  const express = require('express');
  const app = express(); app.use('/api/v1/tickets', require('../src/modules/tickets/ticket.routes')); app.use(require('../src/middleware/errorHandler'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1/tickets`;
  async function post({ name = 'fixture.txt', mime = 'text/plain', data = Buffer.from('safe'), count = 1, field = 'attachment', text, path = '/1/attachments', auth = true, raw, contentType } = {}) {
    const form = new FormData();
    if (text) form.append(text, 'spoofed');
    for (let i = 0; i < count; i++) form.append(field, new Blob([data], { type: mime }), name);
    return fetch(base + path, { method: 'POST', headers: { ...(auth ? { authorization: 'fixture' } : {}), ...(contentType ? { 'content-type': contentType } : {}) }, body: raw ?? form });
  }
  for (const [options, status] of [
    [{ name: 'test.pdf.exe', mime: 'application/pdf' }, 415],
    [{ name: 'photo.png', mime: 'text/plain' }, 415],
    [{ name: 'photo.png', mime: 'image/png' }, 415],
    [{ data: Buffer.alloc(10 * 1024 * 1024 + 1) }, 413],
    [{ field: 'malware' }, 422], [{ count: 2 }, 422], [{ text: 'uploadedByUserId' }, 422],
    [{ data: Buffer.alloc(0) }, 422], [{ count: 0 }, 422],
    [{ path: '/0/attachments' }, 422], [{ path: '/1/comments/0/attachments' }, 422],
    [{ raw: '--broken', contentType: 'multipart/form-data' }, 400],
    [{ raw: '--fixture\r\nContent-Disposition: form-data; name="attachment"; filename="x.txt"\r\nContent-Type: text/plain\r\n\r\ntruncated', contentType: 'multipart/form-data; boundary=fixture' }, 400],
  ]) {
    const response = await post(options);
    assert.equal(response.status, status, JSON.stringify(options, (k,v) => k === 'data' ? undefined : v));
    const body = await response.json(); assert.equal(body.success, false); assert.ok(Array.isArray(body.errors));
    assert.equal(upload.mock.callCount(), 0); assert.equal(insert.mock.callCount(), 0);
  }
  const before = read.mock.callCount();
  assert.equal((await post({ auth: false, raw: 'bad', contentType: 'multipart/form-data' })).status, 401);
  assert.equal(read.mock.callCount(), before);
  // A malformed parser body would yield 400: 404 proves access is checked first.
  for (const denied of [{ id: 4, role: 'EMPLOYEE' }, { id: 8, role: 'TECHNICIAN' }]) {
    user = denied;
    for (const path of ['/1/attachments', '/1/comments/1/attachments']) {
      assert.equal((await post({ path, raw: 'bad', contentType: 'multipart/form-data' })).status, 404);
    }
  }
  assert.equal(upload.mock.callCount(), 0); assert.equal(insert.mock.callCount(), 0);
  const { generatePdfReport } = require('../src/utils/pdf');
  const pdf = await generatePdfReport({ title: 'Harmless upload fixture', columns: [{ header: 'Name', key: 'name' }], rows: [] });
  for (const allowed of [{ id: 3, role: 'EMPLOYEE' }, { id: 7, role: 'TECHNICIAN' }, { id: 9, role: 'ADMIN' }]) {
    user = allowed;
    for (const [name, mime, data] of [['../../report.PDF','application/pdf',pdf], ['photo.png','image/png',png]]) {
      for (const path of ['/1/attachments', '/1/comments/1/attachments']) {
        const response = await post({ name, mime, data, path });
        assert.equal(response.status, 201);
        const result = (await response.json()).data.attachment;
        assert.equal(result.originalName, name.split('/').at(-1));
        assert.equal(saved.uploadedBy, user.id); assert.equal(saved.fileSize, data.length);
        assert.equal(result.fileUrl, undefined);
      }
    }
  }
  assert.equal((await fetch(base + '/1/attachments', { headers: { authorization: 'fixture' } })).status, 200);
  const bytes = Buffer.from('download fixture');
  t.mock.method(globalThis, 'fetch', async () => new Response(bytes));
  // Exercise the real download controller after the service permission checks.
  const controller = require('../src/modules/tickets/ticketAttachment.controller');
  let received;
  const res = { set(headers) { assert.match(headers['Content-Disposition'], /^attachment;/); assert.equal(headers['X-Content-Type-Options'], 'nosniff'); return this; }, status(code) { assert.equal(code, 200); return this; }, send(data) { received = data; } };
  // Repository fixture needs the trusted remote URL for this controller path.
  repository.findById.mock.mockImplementation(async () => ({ id: 1, ticket_id: 1, original_name: 'photo.png', mime_type: 'image/png', resource_type: 'image', public_id: 'fixture', file_url: 'https://example.test/fixture' }));
  await controller.downloadTicketAttachment({ params: { id: '1', attachmentId: '1' }, user }, res, err => { throw err; });
  assert.deepEqual(received, bytes);
});

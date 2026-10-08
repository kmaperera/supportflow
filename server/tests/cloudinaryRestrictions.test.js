const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const configPath = require.resolve('../src/config/cloudinary');
const cloudinary = { uploader: {}, utils: {} };
require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: cloudinary };
const provider = require('../src/services/cloudinaryUpload.service');
const { fetchAttachment } = require('../src/services/attachmentDownload.service');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const input = { buffer: Buffer.from('harmless text'), originalName: 'private-account-notes.txt', mimeType: 'text/plain' };
function mockStream(onOptions, override = {}) {
  cloudinary.uploader.upload_stream = (options, callback) => {
    onOptions(options);
    const stream = new PassThrough(); stream.resume();
    stream.on('finish', () => callback(null, { public_id: `${options.folder}/${options.public_id}`,
      resource_type: options.resource_type, type: options.type,
      secure_url: `https://res.cloudinary.com/test/${options.resource_type}/authenticated/${options.folder}/${options.public_id}`,
      api_key: 'must-not-leak', signature: 'must-not-leak', version: 123, ...override }));
    return stream;
  };
}

test('validated files have fixed folders, generated IDs, narrow formats and authenticated delivery', async () => {
  const { generatePdfReport } = require('../src/utils/pdf');
  const pdf = await generatePdfReport({ title: 'Fixture', columns: [{ header: 'Name', key: 'name' }], rows: [] });
  const seen = new Set();
  for (const [name, mimeType, buffer, resource, format] of [
    ['../../private-invoice.PDF', 'application/pdf', pdf, 'raw', 'pdf'],
    ['private.png', 'image/png', png, 'image', 'png'],
    ['private.jpeg', 'image/jpeg', Buffer.from([255,216,255,224]), 'image', 'jpg'],
    ['private.webp', 'image/webp', Buffer.from('RIFF1234WEBP'), 'image', 'webp'],
    ['private-account-notes.txt', 'text/plain', input.buffer, 'raw', 'txt'],
  ]) {
    mockStream(options => {
      assert.equal(options.folder, 'supportflow/tickets');
      assert.equal(options.resource_type, resource); assert.equal(options.type, 'authenticated');
      assert.deepEqual(options.allowed_formats, [format]);
      assert.equal(options.overwrite, false); assert.equal(options.use_filename, false);
      assert.equal(options.timeout, 30000);
      assert.match(options.public_id, /^[a-f0-9-]{36}(\.[a-z]+)?$/);
      assert.ok(!seen.has(options.public_id)); seen.add(options.public_id);
      assert.doesNotMatch(JSON.stringify(options), /private-account|invoice|evil|secret|transformation/);
      assert.equal(options.format, undefined); // No implicit conversion of rejected formats.
      assert.match(options.filename, new RegExp(`^[a-f0-9-]{36}\\.${format}$`));
    });
    const result = await provider.uploadAttachmentBuffer({ originalName: name, mimeType, buffer,
      folder: '../../evil', publicId: 'evil', transformation: 'evil', type: 'upload' });
    assert.equal(result.resourceType, resource); assert.equal(result.deliveryType, 'authenticated');
    assert.equal(result.bytes, buffer.length); assert.match(result.secureUrl, /^https:/);
    assert.deepEqual(Object.keys(result).sort(), ['publicId','secureUrl','resourceType','deliveryType','bytes'].sort());
    assert.doesNotMatch(JSON.stringify(result), /private-account|invoice|must-not-leak/);
  }
});

test('invalid input never reaches SDK and provider failures are sanitized', async () => {
  let calls = 0;
  mockStream(() => { calls++; });
  assert.throws(() => provider.uploadAttachmentBuffer({ ...input, originalName: 'x.svg', mimeType: 'image/svg+xml' }), { statusCode: 415 });
  assert.throws(() => provider.uploadAttachmentBuffer({ ...input, originalName: 'x.png', mimeType: 'image/png' }), { statusCode: 415 });
  assert.equal(calls, 0);
  for (const override of [{ type: 'upload' }, { resource_type: 'video' }, { public_id: 'unexpected' }, { secure_url: 'http://res.cloudinary.com/test/x' }]) {
    mockStream(() => {}, override);
    await assert.rejects(provider.uploadAttachmentBuffer(input), { statusCode: 502, message: 'Attachment upload failed' });
  }
  cloudinary.uploader.upload_stream = () => { throw new Error('secret provider details'); };
  await assert.rejects(provider.uploadAttachmentBuffer(input), { statusCode: 502, message: 'Attachment upload failed' });
});

test('signed proxy requests expire quickly, use stored type and ignore stored remote URLs', async t => {
  const remote = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.cloudinary.com/fixture-signed');
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    return new Response(input.buffer);
  });
  for (const deliveryType of ['upload', 'private', 'authenticated']) {
    cloudinary.utils.private_download_url = (id, format, options) => {
      assert.equal(id, 'supportflow/tickets/fixture.pdf'); assert.equal(format, undefined);
      assert.equal(options.type, deliveryType); assert.equal(options.resource_type, 'raw');
      assert.equal(options.attachment, true);
      const seconds = options.expires_at - Math.floor(Date.now()/1000);
      assert.ok(seconds >= 59 && seconds <= 60);
      return 'https://api.cloudinary.com/fixture-signed';
    };
    assert.deepEqual(await fetchAttachment({ publicId: 'supportflow/tickets/fixture.pdf', resourceType: 'raw', deliveryType,
      originalName: 'private.pdf', fileUrl: 'http://127.0.0.1/never-fetch' }), input.buffer);
  }
  assert.equal(remote.mock.callCount(), 3);
  await assert.rejects(fetchAttachment({ publicId: 'x', resourceType: 'raw', deliveryType: 'evil' }), { statusCode: 502 });
  assert.equal(remote.mock.callCount(), 3);
});

test('deletion uses trusted delivery/resource metadata, invalidates cache and sanitizes errors', async t => {
  for (const type of ['upload', 'private', 'authenticated']) {
    cloudinary.uploader.destroy = async (id, options) => {
      assert.equal(id, 'supportflow/tickets/generated.pdf');
      assert.deepEqual(options, { resource_type: 'raw', type, invalidate: true, timeout: 30000 });
      return { result: 'ok' };
    };
    assert.deepEqual(await provider.deleteCloudinaryAsset({ publicId: 'supportflow/tickets/generated.pdf', resourceType: 'raw', deliveryType: type }), { result: 'ok' });
  }
  const logs = t.mock.method(console, 'error', () => {});
  cloudinary.uploader.destroy = async () => { throw new Error('private provider signature'); };
  await assert.rejects(provider.deleteCloudinaryAsset({ publicId: 'x', resourceType: 'raw' }), { statusCode: 502, message: 'Attachment asset cleanup failed' });
  assert.doesNotMatch(JSON.stringify(logs.mock.calls), /private provider signature/);
});

test('authenticated metadata survives persistence, rollback and authorized delete without API exposure', async t => {
  const service = require('../src/modules/tickets/ticketAttachment.service');
  const tickets = require('../src/modules/tickets/ticket.repository');
  const repo = require('../src/modules/tickets/ticketAttachment.repository');
  const asset = { publicId: 'generated.pdf', resourceType: 'raw', deliveryType: 'authenticated', secureUrl: 'https://res.cloudinary.com/test/raw/authenticated/generated.pdf' };
  t.mock.method(tickets, 'findById', async () => ({ id: 1, created_by: 1, assigned_to: null, status: 'OPEN' }));
  t.mock.method(provider, 'uploadAttachmentBuffer', async () => asset);
  let saved;
  const create = t.mock.method(repo, 'createAttachment', async data => { saved = data; return 1; });
  const row = { id: 1, ticket_id: 1, public_id: asset.publicId, resource_type: 'raw', delivery_type: 'authenticated', file_url: asset.secureUrl };
  t.mock.method(repo, 'findById', async () => row);
  const cleanup = t.mock.method(provider, 'deleteCloudinaryAsset', async value => {
    assert.deepEqual(value, { publicId: asset.publicId, resourceType: 'raw', deliveryType: 'authenticated' });
    return { result: 'ok' };
  });
  const actor = { id: 1, role: 'ADMIN' };
  const file = { buffer: input.buffer, size: input.buffer.length, originalname: input.originalName, mimetype: input.mimeType };
  const result = await service.uploadTicketAttachment(1, file, actor);
  assert.equal(saved.deliveryType, 'authenticated');
  for (const key of ['fileUrl','publicId','resourceType','deliveryType','signature']) assert.equal(key in result, false);
  assert.equal((await service.getAttachmentForDownload(1, 1, actor)).deliveryType, 'authenticated');
  const failure = new Error('DB failure');
  create.mock.mockImplementation(async () => { throw failure; });
  await assert.rejects(service.uploadTicketAttachment(1, file, actor), err => err === failure);
  assert.equal(cleanup.mock.callCount(), 1);
  const logs = t.mock.method(console, 'error', () => {});
  cleanup.mock.mockImplementation(async () => ({ result: 'failed' }));
  await assert.rejects(service.uploadTicketAttachment(1, file, actor), err => err === failure);
  assert.equal(logs.mock.callCount(), 1);
  const remove = t.mock.method(repo, 'deleteById', async () => 1);
  await assert.rejects(service.deleteTicketAttachment(1, 1, actor), { statusCode: 502 });
  assert.equal(remove.mock.callCount(), 0);
  cleanup.mock.mockImplementation(async () => ({ result: 'ok' }));
  await service.deleteTicketAttachment(1, 1, actor);
  assert.equal(remove.mock.callCount(), 1);
});

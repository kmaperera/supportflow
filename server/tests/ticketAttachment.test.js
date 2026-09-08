const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");

// Stub the config module so tests never load credentials or contact Cloudinary.
const configPath = require.resolve("../src/config/cloudinary");
const cloudinary = { uploader: {} };
require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: cloudinary };
const upload = require("../src/services/cloudinaryUpload.service");
const tickets = require("../src/modules/tickets/ticket.repository");
const attachments = require("../src/modules/tickets/ticketAttachment.repository");
const service = require("../src/modules/tickets/ticketAttachment.service");
const comments = require("../src/modules/tickets/ticketComment.repository");
const file = { originalname: "report.txt", mimetype: "text/plain", size: 3, buffer: Buffer.from("abc") };
const ticket = { id: 5, ticket_number: "TKT-000005", created_by: 3, assigned_to: 7, status: "OPEN" };
const asset = { publicId: "asset-id", secureUrl: "https://example.com/file", resourceType: "raw", bytes: 3 };

test("authorization and workflow failures never upload", async (t) => {
  let currentTicket = { ...ticket };
  t.mock.method(tickets, "findById", async () => currentTicket);
  const send = t.mock.method(upload, "uploadAttachmentBuffer", async () => asset);
  for (const [id, currentFile, user, status] of [
    [0, file, { id: 3, role: "EMPLOYEE" }, 422],
    [5, file, null, 401], [5, file, { id: 3, role: "UNKNOWN" }, 403],
    [5, null, { id: 3, role: "EMPLOYEE" }, 422],
    [5, file, { id: 4, role: "EMPLOYEE" }, 404],
    [5, file, { id: 8, role: "TECHNICIAN" }, 404],
  ]) {
    await assert.rejects(service.uploadTicketAttachment(id, currentFile, user), { statusCode: status });
  }
  currentTicket.assigned_to = null;
  await assert.rejects(service.uploadTicketAttachment(5, file, { id: 7, role: "TECHNICIAN" }), { statusCode: 404 });
  for (const status of ["RESOLVED", "CLOSED"]) {
    currentTicket.status = status;
    await assert.rejects(service.uploadTicketAttachment(5, file, { id: 9, role: "ADMIN" }), { statusCode: 409 });
  }
  currentTicket = null;
  await assert.rejects(service.uploadTicketAttachment(5, file, { id: 9, role: "ADMIN" }), { statusCode: 404 });
  assert.equal(send.mock.callCount(), 0);
});

test("allowed roles/statuses persist trusted metadata and return safe fields", async (t) => {
  t.mock.method(tickets, "findById", async () => ticket);
  const send = t.mock.method(upload, "uploadAttachmentBuffer", async () => asset);
  let saved;
  t.mock.method(attachments, "createAttachment", async (value) => { saved = value; return 10; });
  t.mock.method(attachments, "findById", async () => ({
    id: 10, ticket_id: 5, comment_id: null, uploaded_by: saved.uploadedBy,
    original_name: saved.originalName, file_url: saved.fileUrl, resource_type: saved.resourceType,
    mime_type: saved.mimeType, file_size: saved.fileSize, created_at: "now",
    uploader_first_name: "Test", uploader_last_name: "User", uploader_email: "test@example.com",
    uploader_role: "EMPLOYEE", uploader_profile_image_url: null,
    password_hash: "hidden", public_id: "hidden", buffer: file.buffer,
  }));
  for (const status of ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_USER", "REOPENED"]) {
    ticket.status = status;
    for (const user of [{ id: "3", role: "EMPLOYEE" }, { id: "7", role: "TECHNICIAN" }, { id: 9, role: "ADMIN" }]) {
      const result = await service.uploadTicketAttachment("5", file, user);
      assert.equal(saved.uploadedBy, user.id);
      assert.equal(saved.commentId, null);
      assert.equal(saved.ticketId, "5");
      assert.equal(saved.publicId, asset.publicId);
      assert.equal(result.uploadedBy.id, user.id);
      assert.deepEqual(Object.keys(result).sort(), ["id", "ticketId", "commentId", "originalName", "fileUrl", "resourceType", "mimeType", "fileSize", "createdAt", "uploadedBy"].sort());
    }
  }
  assert.equal(send.mock.calls[0].arguments[0].folder, "supportflow/tickets/TKT-000005");
  asset.bytes = undefined;
  await service.uploadTicketAttachment(5, file, { id: 9, role: "ADMIN" });
  assert.equal(saved.fileSize, file.size);
  asset.bytes = 3;
  ticket.status = "OPEN";
});

test("insert failure cleans up and preserves original failure; read failure does not delete", async (t) => {
  const failure = new Error("database failure");
  t.mock.method(tickets, "findById", async () => ticket);
  t.mock.method(upload, "uploadAttachmentBuffer", async () => asset);
  const insert = t.mock.method(attachments, "createAttachment", async () => { throw failure; });
  const cleanup = t.mock.method(upload, "deleteCloudinaryAsset", async () => { throw new Error("cleanup failed"); });
  await assert.rejects(service.uploadTicketAttachment(5, file, { id: 9, role: "ADMIN" }), err => err === failure);
  assert.deepEqual(cleanup.mock.calls[0].arguments[0], { publicId: "asset-id", resourceType: "raw" });
  insert.mock.mockImplementation(async () => 10);
  t.mock.method(attachments, "findById", async () => { throw failure; });
  await assert.rejects(service.uploadTicketAttachment(5, file, { id: 9, role: "ADMIN" }), err => err === failure);
  assert.equal(cleanup.mock.callCount(), 1);
});

test("repository uses bound parameters and explicit safe uploader columns", async () => {
  let query;
  const db = { async query(sql, values) { query = { sql, values }; return [{ insertId: 10 }]; } };
  assert.equal(await attachments.createAttachment({ ticketId: 5, uploadedBy: 3, originalName: "x'--", publicId: "asset", fileUrl: "https://example.com", resourceType: "raw", mimeType: "text/plain", fileSize: 3 }, db), 10);
  assert.equal(query.values[1], null);
  assert.equal(query.values[3], "x'--");
  assert.equal(query.sql.includes("x'--"), false);
  db.query = async (sql, values) => { query = { sql, values }; return [[{ id: 10 }]]; };
  assert.deepEqual(await attachments.findById(10, db), { id: 10 });
  assert.deepEqual(query.values, [10]);
  assert.doesNotMatch(query.sql, /password|SELECT\s+\*/i);
});

test("Cloudinary helper streams memory, maps output and sanitizes failures", async () => {
  let options;
  cloudinary.uploader.upload_stream = (value, callback) => {
    options = value;
    const stream = new PassThrough();
    const chunks = [];
    stream.on("data", chunk => chunks.push(chunk));
    stream.on("end", () => {
      assert.deepEqual(Buffer.concat(chunks), file.buffer);
      callback(null, { public_id: "asset-id", secure_url: asset.secureUrl, resource_type: "raw", bytes: 3 });
    });
    return stream;
  };
  assert.deepEqual(await upload.uploadAttachmentBuffer({ buffer: file.buffer, folder: "safe", originalName: "../report.txt", mimeType: file.mimetype }), asset);
  assert.equal(options.resource_type, "auto");
  assert.equal(options.folder, "safe");
  assert.equal(options.use_filename, false);
  cloudinary.uploader.destroy = async (id, value) => { assert.equal(id, "asset-id"); assert.equal(value.resource_type, "raw"); return { result: "ok" }; };
  await upload.deleteCloudinaryAsset({ publicId: "asset-id", resourceType: "raw" });
  cloudinary.uploader.upload_stream = () => { throw new Error("secret provider details"); };
  await assert.rejects(upload.uploadAttachmentBuffer({ buffer: file.buffer }), { statusCode: 502, message: "Attachment upload failed" });
});

test("route parses one file, ignores spoofed fields and normalizes Multer errors", async (t) => {
  const express = require("express");
  const authPath = require.resolve("../src/middleware/authenticate");
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports(req, res, next) {
    if (!req.headers.authorization) return res.sendStatus(401);
    req.user = { id: 3, role: "EMPLOYEE" };
    next();
  } };
  const calls = t.mock.method(service, "uploadTicketAttachment", async (id, received, user) => {
    assert.equal(id, "5");
    assert.equal(user.id, 3);
    assert.ok(Buffer.isBuffer(received.buffer));
    return { id: 10, ticketId: 5, commentId: null, uploadedBy: { id: user.id } };
  });
  const app = express();
  app.use("/api/v1/tickets", require("../src/modules/tickets/ticket.routes"));
  app.use(require("../src/middleware/errorHandler"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/tickets`;
  async function request({ id = "5", field = "attachment", size = 3, count = 1, auth = true } = {}) {
    const form = new FormData();
    for (const key of ["uploadedBy", "ticketId", "commentId", "publicId", "fileUrl", "mimeType", "fileSize", "resourceType"]) form.append(key, "spoofed");
    for (let i = 0; i < count; i++) form.append(field, new Blob([Buffer.alloc(size)], { type: "text/plain" }), "report.txt");
    return fetch(`${url}/${id}/attachments`, { method: "POST", headers: auth ? { authorization: "test" } : {}, body: form });
  }
  const success = await request();
  assert.equal(success.status, 201);
  assert.deepEqual(await success.json(), { success: true, message: "Attachment uploaded successfully", data: { attachment: { id: 10, ticketId: 5, commentId: null, uploadedBy: { id: 3 } } } });
  for (const [options, status, message] of [
    [{ field: "wrong" }, 422, "Unexpected file field"],
    [{ count: 2 }, 422, "Unexpected file field"],
    [{ size: 10 * 1024 * 1024 + 1 }, 413, "File size exceeds the 10 MB limit"],
    [{ count: 0 }, 422, "Attachment file is required"],
    [{ id: "0" }, 422, "Validation failed"],
  ]) {
    const response = await request(options);
    assert.equal(response.status, status);
    assert.equal((await response.json()).message, message);
  }
  assert.equal((await request({ auth: false })).status, 401);
  assert.equal(calls.mock.callCount(), 1);
  const commentCalls = t.mock.method(service, "uploadCommentAttachment", async (id, commentId, received, user) => {
    assert.equal(id, "5");
    assert.equal(commentId, "22");
    assert.equal(user.id, 3);
    assert.ok(Buffer.isBuffer(received.buffer));
    return { id: 15, ticketId: 5, commentId: 22 };
  });
  for (const [commentId, field, status] of [["22", "attachment", 201], ["0", "attachment", 422],
    ["18446744073709551616", "attachment", 422], ["22", "wrong", 422]]) {
    const form = new FormData();
    for (const key of ["ticketId", "commentId", "uploadedBy", "visibility", "isInternal", "publicId"]) form.append(key, "spoofed");
    form.append(field, new Blob(["abc"], { type: "text/plain" }), "report.txt");
    const response = await fetch(`${url}/5/comments/${commentId}/attachments`, {
      method: "POST", headers: { authorization: "test" }, body: form,
    });
    assert.equal(response.status, status);
    if (status === 201) assert.deepEqual(await response.json(), {
      success: true, message: "Comment attachment uploaded successfully",
      data: { attachment: { id: 15, ticketId: 5, commentId: 22 } },
    });
  }
  assert.equal(commentCalls.mock.callCount(), 1);
});

test("comment attachment role/type/status matrix and trusted metadata", async (t) => {
  const currentTicket = { ...ticket };
  const comment = { id: 22, ticket_id: "5", comment_type: "PUBLIC" };
  t.mock.method(tickets, "findById", async () => currentTicket);
  t.mock.method(comments, "findById", async () => comment);
  const send = t.mock.method(upload, "uploadAttachmentBuffer", async () => asset);
  let saved;
  const insert = t.mock.method(attachments, "createAttachment", async value => { saved = value; return 15; });
  t.mock.method(attachments, "findById", async () => ({ id: 15, ticket_id: saved.ticketId,
    comment_id: saved.commentId, uploaded_by: saved.uploadedBy, public_id: "hidden" }));
  for (const type of ["PUBLIC", "INTERNAL"]) {
    comment.comment_type = type;
    for (const status of ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "REOPENED", "CLOSED"]) {
      currentTicket.status = status;
      for (const user of [{ id: "3", role: "EMPLOYEE" }, { id: "7", role: "TECHNICIAN" }, { id: 9, role: "ADMIN" }]) {
        const before = send.mock.callCount();
        const insertsBefore = insert.mock.callCount();
        const hidden = type === "INTERNAL" && (user.role === "EMPLOYEE" ||
          (user.role === "TECHNICIAN" && status === "OPEN"));
        const blocked = status === "CLOSED" || (type === "PUBLIC" && status === "RESOLVED");
        if (hidden || blocked) {
          await assert.rejects(service.uploadCommentAttachment("5", "22", file, user), {
            statusCode: hidden ? 404 : 409,
            message: hidden ? "Comment not found" : type === "INTERNAL"
              ? "Attachments cannot be added to a closed ticket"
              : "Attachments cannot be added in the ticket's current status",
          });
          assert.equal(send.mock.callCount(), before);
          assert.equal(insert.mock.callCount(), insertsBefore);
        } else {
          const result = await service.uploadCommentAttachment("5", "22", file, user);
          assert.equal(result.commentId, "22");
          assert.equal(saved.uploadedBy, user.id);
          assert.equal(saved.publicId, asset.publicId);
          assert.equal(saved.fileUrl, asset.secureUrl);
          assert.equal(saved.fileSize, asset.bytes);
          assert.equal("visibility" in saved, false);
          assert.equal("publicId" in result, false);
          assert.equal(send.mock.calls.at(-1).arguments[0].folder, "supportflow/tickets/TKT-000005/comments/22");
        }
      }
    }
  }
});

test("comment attachment rejects missing, mismatched and unauthorized resources before upload", async (t) => {
  let currentTicket = { ...ticket };
  let comment = { id: 22, ticket_id: 5, comment_type: "PUBLIC" };
  t.mock.method(tickets, "findById", async () => currentTicket);
  t.mock.method(comments, "findById", async () => comment);
  const send = t.mock.method(upload, "uploadAttachmentBuffer", async () => asset);
  const admin = { id: 9, role: "ADMIN" };
  for (const bad of [undefined, 0, -1, "1.5", "18446744073709551616", Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(service.uploadCommentAttachment(bad, 22, file, admin), { statusCode: 422 });
    await assert.rejects(service.uploadCommentAttachment(5, bad, file, admin), { statusCode: 422 });
  }
  await assert.rejects(service.uploadCommentAttachment(5, 22, file, null), { statusCode: 401 });
  await assert.rejects(service.uploadCommentAttachment(5, 22, file, { id: 9, role: "OTHER" }), { statusCode: 403 });
  await assert.rejects(service.uploadCommentAttachment(5, 22, null, admin), { statusCode: 422 });
  for (const user of [{ id: 4, role: "EMPLOYEE" }, { id: 8, role: "TECHNICIAN" }]) {
    await assert.rejects(service.uploadCommentAttachment(5, 22, file, user), { statusCode: 404 });
  }
  currentTicket.assigned_to = null;
  await assert.rejects(service.uploadCommentAttachment(5, 22, file, { id: 7, role: "TECHNICIAN" }), { statusCode: 404 });
  const invalidTypeComment = { ...comment, comment_type: "OTHER" };
  for (const value of [null, { ...comment, ticket_id: 6 }]) {
    comment = value;
    await assert.rejects(service.uploadCommentAttachment(5, 22, file, admin), { statusCode: 404, message: "Comment not found" });
  }
  comment = invalidTypeComment;
  await assert.rejects(service.uploadCommentAttachment(5, 22, file, admin), { statusCode: 500, message: "Invalid comment type" });
  currentTicket = null;
  await assert.rejects(service.uploadCommentAttachment(5, 22, file, admin), { statusCode: 404, message: "Ticket not found" });
  assert.equal(send.mock.callCount(), 0);
});

test("comment insert failure cleans up the uploaded asset and preserves DB error", async (t) => {
  t.mock.method(tickets, "findById", async () => ticket);
  t.mock.method(comments, "findById", async () => ({ id: 22, ticket_id: 5, comment_type: "PUBLIC" }));
  t.mock.method(upload, "uploadAttachmentBuffer", async () => asset);
  const failure = new Error("insert failed");
  t.mock.method(attachments, "createAttachment", async () => { throw failure; });
  const cleanup = t.mock.method(upload, "deleteCloudinaryAsset", async () => { throw new Error("cleanup failed"); });
  await assert.rejects(service.uploadCommentAttachment(5, 22, file, { id: 9, role: "ADMIN" }), err => err === failure);
  assert.deepEqual(cleanup.mock.calls[0].arguments[0], { publicId: asset.publicId, resourceType: asset.resourceType });
});

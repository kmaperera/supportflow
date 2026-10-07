const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const helmet = require("helmet");
const { securityHeaders } = require("../src/middleware/securityHeaders");

async function listen(app, t) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

function verify(headers, production = false) {
  for (const [key, value] of Object.entries({
    "x-content-type-options": "nosniff", "x-frame-options": "DENY",
    "referrer-policy": "no-referrer", "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin", "origin-agent-cluster": "?1",
    "x-dns-prefetch-control": "off", "x-download-options": "noopen",
    "x-permitted-cross-domain-policies": "none", "x-xss-protection": "0",
    "content-security-policy": "default-src 'none';base-uri 'none';form-action 'none';frame-ancestors 'none'",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  })) assert.equal(headers.get(key), value, key);
  assert.equal(headers.get("strict-transport-security"), production ? "max-age=31536000" : null);
  for (const key of ["x-powered-by", "cross-origin-embedder-policy", "content-security-policy-report-only"]) {
    assert.equal(headers.get(key), null, key);
  }
}

test("installed Helmet baseline and environment-specific policy", async t => {
  const app = express();
  app.get("/baseline", helmet(), (req, res) => res.json({ ok: true }));
  for (const environment of ["development", "test", "production"]) {
    app.get(`/${environment}`, securityHeaders(environment), (req, res) => res.json({ ok: true }));
  }
  const { base } = await listen(app, t);
  const before = await fetch(`${base}/baseline`);
  assert.equal(before.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(before.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
  assert.match(before.headers.get("content-security-policy"), /'unsafe-inline'/);
  for (const environment of ["development", "test", "production"]) {
    const response = await fetch(`${base}/${environment}`);
    verify(response.headers, environment === "production");
    assert.deepEqual(await response.json(), { ok: true });
  }
});

test("real app routes, sensitive errors and both Socket.IO transports retain their contracts", async t => {
  Object.assign(process.env, { NODE_ENV: "test", CLIENT_URL: "http://localhost:5173",
    CLOUDINARY_CLOUD_NAME: "fixture", CLOUDINARY_API_KEY: "fixture", CLOUDINARY_API_SECRET: "fixture" });
  t.mock.method(require("../src/utils/jwt"), "verifyAccessToken", () => ({ sub: "1" }));
  t.mock.method(require("../src/config/database"), "query", async () => [[]]);
  t.mock.method(require("../src/modules/users/user.repository"), "findById", async () => ({
    id: 1, role: "ADMIN", is_active: 1, first_name: "Header", last_name: "Fixture",
  }));
  t.mock.method(require("../src/modules/tickets/ticketAttachment.service"), "getAttachmentForDownload", async () => ({
    originalName: "header-check.txt", mimeType: "text/plain",
  }));
  t.mock.method(require("../src/services/attachmentDownload.service"), "fetchAttachment", async () => Buffer.from("attachment fixture"));
  const app = require("../src/app");
  const { server, base } = await listen(app, t);
  for (const [path, status, sensitive, options] of [
    ["/api/v1/health", 200, false],
    ["/api/v1/auth/me", 200, true, { headers: { Authorization: "Bearer fixture" } }],
    ["/api/v1/auth/me", 401, true],
    ["/api/v1/auth/login", 422, true, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }],
    ["/api/v1/auth/refresh", 401, true, { method: "POST" }],
    ["/api/v1/auth/login", 400, true, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }],
    ["/api/v1/reports/unknown", 401, true],
    ["/missing", 404, false],
  ]) {
    const response = await fetch(base + path, options);
    assert.equal(response.status, status, path);
    verify(response.headers);
    assert.equal(response.headers.get("cache-control"), sensitive ? "private, no-store" : null);
    assert.match(response.headers.get("content-type"), /^application\/json/);
    await response.json();
  }
  for (const [path, mime, prefix] of [
    ["/api/v1/reports/tickets/export/csv", "text/csv", "\uFEFF"],
    ["/api/v1/reports/tickets/export/pdf", "application/pdf", "%PDF-"],
    ["/api/v1/tickets/1/attachments/1/download", "text/plain", "attachment fixture"],
  ]) {
    const response = await fetch(base + path, { headers: { Authorization: "Bearer fixture" } });
    assert.equal(response.status, 200, path);
    verify(response.headers);
    assert.ok(response.headers.get("content-type").startsWith(mime));
    assert.match(response.headers.get("content-disposition"), /^attachment; filename=/);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.ok(Buffer.from(await response.arrayBuffer()).toString("utf8").startsWith(prefix));
  }
  const io = require("../src/config/socket").initializeSocket(server);
  t.after(() => io.close());
  const { io: connect } = require("socket.io-client");
  for (const transport of ["polling", "websocket"]) {
    const client = connect(base, { transports: [transport], auth: { token: "fixture" }, reconnection: false });
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(Error("Socket connection timed out")), 5000);
        client.once("connect", () => { clearTimeout(timeout); resolve(); });
        client.once("connect_error", error => { clearTimeout(timeout); reject(error); });
      });
      const received = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(Error("Notification timed out")), 5000);
        client.once("notification:new", value => { clearTimeout(timeout); resolve(value); });
      });
      io.to("user:1").emit("notification:new", { message: "Header regression" });
      assert.deepEqual(await received, { message: "Header regression" });
    } finally { client.disconnect(); }
  }
});

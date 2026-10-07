const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createApiRateLimiter, rateLimitSettings } = require("../src/middleware/rateLimiter");

async function start(app, t) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("safe settings stay enabled in every environment and reject malformed overrides", () => {
  for (const NODE_ENV of ["production", "test", "development", undefined]) {
    const fallback = rateLimitSettings({ NODE_ENV });
    assert.deepEqual(fallback, { windowMs: 900000, limit: NODE_ENV === "development" ? 5000 : 1000 });
    for (const value of ["", "0", "-1", "1.5", "NaN", "Infinity", "3abc", "999999999999999999999", " ", null]) {
      assert.deepEqual(rateLimitSettings({ NODE_ENV, API_RATE_LIMIT_WINDOW_MS: value, API_RATE_LIMIT_MAX: value }), fallback);
    }
  }
  assert.deepEqual(rateLimitSettings({ API_RATE_LIMIT_WINDOW_MS: "5000", API_RATE_LIMIT_MAX: "3" }), { windowMs: 5000, limit: 3 });
});

test("API budget, standard headers, OPTIONS, untrusted headers and expiry", async t => {
  const app = express();
  app.use("/api/v1", createApiRateLimiter({ API_RATE_LIMIT_MAX: "2", API_RATE_LIMIT_WINDOW_MS: "1000" }));
  app.use((req, res) => res.json({ ok: true }));
  const base = await start(app, t);
  for (let i = 0; i < 3; i++) {
    const outside = await fetch(base + "/");
    assert.equal(outside.headers.get("ratelimit"), null);
    assert.equal((await fetch(base + "/api/v1/health", { method: "OPTIONS" })).status, 200);
  }
  const first = await fetch(base + "/api/v1/health");
  assert.equal(first.status, 200);
  assert.ok(first.headers.get("ratelimit"));
  assert.ok(first.headers.get("ratelimit-policy"));
  assert.equal(first.headers.get("x-ratelimit-limit"), null);
  assert.equal((await fetch(base + "/api/v1/tickets")).status, 200);
  const blocked = await fetch(base + "/api/v1/auth/login", { method: "POST", headers: { "X-Internal": "true", "X-Forwarded-For": "203.0.113.7" } });
  assert.equal(blocked.status, 429);
  assert.deepEqual(await blocked.json(), { success: false, message: "Too many requests. Please try again later.", errors: [] });
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal(blocked.headers.get("cache-control"), "private, no-store");
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal((await fetch(base + "/api/v1/health")).status, 200);
});

test("actual app limits health and auth together before parsing while preserving headers", async t => {
  Object.assign(process.env, { NODE_ENV: "test", API_RATE_LIMIT_MAX: "2", API_RATE_LIMIT_WINDOW_MS: "900000",
    CLIENT_URL: "http://localhost:5173", CLOUDINARY_CLOUD_NAME: "fixture", CLOUDINARY_API_KEY: "fixture", CLOUDINARY_API_SECRET: "fixture" });
  t.mock.method(require("../src/config/database"), "query", async () => [[]]);
  const app = require("../src/app");
  assert.equal(app.get("trust proxy"), false);
  const base = await start(app, t);
  const preflight = await fetch(base + "/api/v1/auth/login", { method: "OPTIONS", headers: { Origin: process.env.CLIENT_URL, "Access-Control-Request-Method": "POST" } });
  assert.equal(preflight.status, 204);
  assert.equal((await fetch(base + "/api/v1/health")).status, 200);
  assert.equal((await fetch(base + "/api/v1/auth/me")).status, 401);
  const response = await fetch(base + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: process.env.CLIENT_URL }, body: "{" });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("access-control-allow-origin"), process.env.CLIENT_URL);
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.equal((await fetch(base + "/")).status, 200);
});

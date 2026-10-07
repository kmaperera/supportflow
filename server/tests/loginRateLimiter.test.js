const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createLoginRateLimiter, loginRateLimitSettings } = require("../src/middleware/rateLimiter");

async function listen(app, t) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("login config stays strict in every environment with safe fallbacks", () => {
  for (const NODE_ENV of ["development", "test", "production", undefined]) {
    for (const value of [undefined, "0", "-1", "NaN", "Infinity", "1.5", "999999999999999999999", "abc", ""]) {
      assert.deepEqual(loginRateLimitSettings({ NODE_ENV, LOGIN_RATE_LIMIT_MAX: value, LOGIN_RATE_LIMIT_WINDOW_MS: value }), { windowMs: 900000, limit: 5 });
    }
  }
  assert.deepEqual(loginRateLimitSettings({ LOGIN_RATE_LIMIT_MAX: "2", LOGIN_RATE_LIMIT_WINDOW_MS: "1000" }), { windowMs: 1000, limit: 2 });
});

test("success is discounted without resetting failures; window expiry restores access", async t => {
  const app = express();
  app.post("/login", createLoginRateLimiter({ LOGIN_RATE_LIMIT_MAX: "2", LOGIN_RATE_LIMIT_WINDOW_MS: "1000" }), (req, res) => res.sendStatus(req.query.success ? 200 : 401));
  const base = await listen(app, t);
  const post = suffix => fetch(base + "/login" + suffix, { method: "POST" });
  assert.equal((await post("")).status, 401);
  for (let i = 0; i < 4; i++) assert.equal((await post("?success=1")).status, 200);
  assert.equal((await post("")).status, 401);
  assert.equal((await post("?success=1")).status, 429);
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal((await post("?success=1")).status, 200);
});

test("actual login validates and counts wrong, unknown, inactive and malformed attempts without blocking other auth routes", async t => {
  Object.assign(process.env, { NODE_ENV: "test", LOGIN_RATE_LIMIT_MAX: "5", API_RATE_LIMIT_MAX: "1000",
    CLOUDINARY_CLOUD_NAME: "fixture", CLOUDINARY_API_KEY: "fixture", CLOUDINARY_API_SECRET: "fixture" });
  const users = require("../src/modules/users/user.repository");
  const password = require("../src/utils/password");
  const hash = await password.hashPassword("CorrectFixturePassword123!");
  t.mock.method(users, "findByEmail", async email => email === "nobody-supportflow@example.com" ? null : {
    id: 1, email, role: "EMPLOYEE", is_active: email !== "inactive@example.com", password_hash: hash,
    first_name: "Login", last_name: "Fixture",
  });
  t.mock.method(users, "updateLastLogin", async () => {});
  const jwt = require("../src/utils/jwt");
  t.mock.method(jwt, "generateAccessToken", () => "fixture-access-token");
  t.mock.method(jwt, "verifyRefreshToken", () => ({ exp: Math.floor(Date.now() / 1000) + 3600 }));
  t.mock.method(require("../src/modules/auth/refreshToken.service"), "createRefreshToken", async () => "fixture-refresh-token");
  t.mock.method(require("../src/config/database"), "query", async () => [[]]);
  const base = await listen(require("../src/app"), t);
  const post = (email, password = "DefinitelyWrongPassword123!") => fetch(base + "/api/v1/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
  });
  const success = await post("known@example.com", "CorrectFixturePassword123!");
  assert.equal(success.status, 200);
  const body = await success.json();
  assert.equal(body.data.accessToken, "fixture-access-token");
  assert.equal(body.data.user.email, "known@example.com");
  assert.match(success.headers.get("set-cookie"), /^refreshToken=fixture-refresh-token;/);
  assert.match(success.headers.get("ratelimit"), /"api"/);
  assert.match(success.headers.get("ratelimit"), /"login"/);
  for (const [email, status] of [["known@example.com", 401], ["nobody-supportflow@example.com", 401], ["inactive@example.com", 403], ["bad-email", 422], ["known@example.com", 401]]) {
    const response = await post(email);
    assert.equal(response.status, status);
    if (status === 401) assert.equal((await response.json()).message, "Invalid email or password");
  }
  const blocked = await post("different@example.com");
  assert.equal(blocked.status, 429);
  assert.deepEqual(await blocked.json(), { success: false, message: "Too many login attempts. Please try again later.", errors: [] });
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.ok(blocked.headers.get("ratelimit-policy"));
  assert.equal(blocked.headers.get("x-ratelimit-limit"), null);
  assert.equal(blocked.headers.get("cache-control"), "private, no-store");
  for (const [path, method, expected] of [["health", "GET", 200], ["auth/refresh", "POST", 401], ["auth/logout", "POST", 200], ["auth/logout-all", "POST", 401], ["auth/change-password", "PATCH", 401], ["tickets/my", "GET", 401]]) {
    assert.equal((await fetch(`${base}/api/v1/${path}`, { method })).status, expected, path);
  }
});


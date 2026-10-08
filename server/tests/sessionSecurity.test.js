const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const tokens = require("../src/utils/jwt");

test("token verification and session lifecycle fail closed", async t => {
  const { app, user, records } = await require("./helpers/cookieApp")();
  const refresh = require("../src/modules/auth/refreshToken.service");
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const access = tokens.generateAccessToken(user);
  const accessClaims = tokens.verifyAccessToken(access);
  assert.equal(accessClaims.type, "access");
  assert.equal(accessClaims.exp - accessClaims.iat, 900);
  assert.deepEqual(Object.keys(accessClaims).sort(), ["exp", "iat", "role", "sub", "type"]);
  const get = (token, path = "/auth/me") => fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const post = (path, raw) => fetch(base + path, { method: "POST", headers: raw ? { Cookie: `refreshToken=${raw}` } : {} });
  const sign = (payload = {}, options = {}) => jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { subject: "1", algorithm: "HS256", expiresIn: "15m", ...options });
  assert.equal((await get(access)).status, 200);
  const tampered = access.slice(0, -10) + (access.at(-10) === "x" ? "y" : "x") + access.slice(-9);
  for (const value of [undefined, tampered, sign({}, { expiresIn: -1 }), sign({}, { algorithm: "HS384" }), sign({ type: "other" }), jwt.sign({ sub: "1" }, process.env.JWT_ACCESS_SECRET), sign({}, { subject: "0" })]) {
    assert.equal((await get(value)).status, 401);
  }
  const initial = await refresh.createRefreshToken(1);
  const claims = tokens.verifyRefreshToken(initial);
  assert.equal(claims.exp - claims.iat, 604800);
  assert.equal(records.at(-1).token_hash.length, 64);
  assert.notEqual(records.at(-1).token_hash, initial);
  assert.equal(records.at(-1).expires_at.getTime(), claims.exp * 1000);
  assert.equal((await get(initial)).status, 401);
  assert.equal((await post("/auth/refresh", access)).status, 401);
  const expired = jwt.sign({ type: "refresh" }, process.env.JWT_REFRESH_SECRET, { subject: "1", algorithm: "HS256", expiresIn: -1 });
  assert.equal((await post("/auth/refresh", expired)).status, 401);
  const noExpiry = jwt.sign({ type: "refresh", sub: "1" }, process.env.JWT_REFRESH_SECRET);
  assert.equal((await post("/auth/refresh", noExpiry)).status, 401);
  // Even accidental secret equality cannot interchange token types.
  const savedSecret = process.env.JWT_REFRESH_SECRET;
  process.env.JWT_REFRESH_SECRET = process.env.JWT_ACCESS_SECRET;
  assert.throws(() => tokens.verifyAccessToken(tokens.generateRefreshToken(1)));
  assert.throws(() => tokens.verifyRefreshToken(access));
  process.env.JWT_REFRESH_SECRET = savedSecret;
  const concurrent = await Promise.allSettled([refresh.rotateRefreshToken(initial), refresh.rotateRefreshToken(initial)]);
  assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(concurrent.find(result => result.status === "rejected").reason.statusCode, 401);
  assert.equal((await post("/auth/refresh", initial)).status, 401);
  user.role = "TECHNICIAN";
  assert.equal((await (await get(access)).json()).data.user.role, "TECHNICIAN");
  const current = concurrent.find(result => result.status === "fulfilled").value.refreshToken;
  const rotated = await refresh.rotateRefreshToken(current);
  assert.equal(tokens.verifyAccessToken(rotated.accessToken).role, "TECHNICIAN");
  user.is_active = "0";
  assert.equal((await get(access)).status, 403);
  assert.equal((await post("/auth/refresh", rotated.refreshToken)).status, 403);
  await assert.rejects(require("../src/modules/auth/auth.service").login(user.email, "CookieFixture123!"), { statusCode: 403 });
  await assert.rejects(require("../src/modules/auth/auth.service").login(user.email, "WrongFixture123!"), { statusCode: 401, message: "Invalid email or password" });
  user.is_active = 1;
  user.must_change_password = 1;
  assert.equal((await get(access)).status, 200);
  assert.equal((await get(access, "/tickets/categories")).status, 403);
  const second = await refresh.createRefreshToken(1);
  const users = require("../src/modules/users/user.repository");
  t.mock.method(users, "updatePassword", async (id, hash) => { user.password_hash = hash; user.must_change_password = 0; });
  t.mock.method(require("../src/config/database"), "getConnection", async () => ({
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
  }));
  const changed = await fetch(base + "/auth/change-password", { method: "PATCH", headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: "CookieFixture123!", newPassword: "ChangedFixture123!", confirmPassword: "ChangedFixture123!" }) });
  assert.equal(changed.status, 200);
  assert.ok(records.every(row => row.revoked_at));
  for (const raw of [second, rotated.refreshToken]) assert.equal((await post("/auth/refresh", raw)).status, 401);
  // Existing short-lived bearer tokens are not blacklisted on password change/logout.
  assert.equal((await get(access)).status, 200);
  const logoutToken = await refresh.createRefreshToken(1);
  assert.equal((await post("/auth/logout", logoutToken)).status, 200);
  assert.equal((await post("/auth/refresh", logoutToken)).status, 401);
  const pair = await Promise.all([refresh.createRefreshToken(1), refresh.createRefreshToken(1)]);
  assert.notEqual(pair[0], pair[1]);
  assert.equal((await post("/auth/logout-all", pair[0])).status, 200);
  for (const raw of pair) assert.equal((await post("/auth/refresh", raw)).status, 401);
  const dbExpired = await refresh.createRefreshToken(1);
  records.at(-1).expires_at = new Date(0);
  assert.equal((await post("/auth/refresh", dbExpired)).status, 401);
  const deletedUser = await refresh.createRefreshToken(1);
  t.mock.method(users, "findById", async () => null);
  assert.equal((await get(access)).status, 401);
  assert.equal((await post("/auth/refresh", deletedUser)).status, 401);
  const malformed = await fetch(base + "/auth/me", { headers: { Authorization: "Basic fixture" } });
  assert.equal(malformed.status, 401);
});

test("startup configuration validates secrets and duration semantics without exposing values", () => {
  const saved = { ...process.env };
  try {
    const crypto = require("node:crypto");
    Object.assign(process.env, { NODE_ENV: "production", JWT_ACCESS_SECRET: crypto.randomBytes(32).toString("hex"), JWT_REFRESH_SECRET: crypto.randomBytes(32).toString("hex"), JWT_ACCESS_EXPIRES_IN: "15m", JWT_REFRESH_EXPIRES_IN: "7d" });
    tokens.validateJwtConfiguration();
    const strong = process.env.JWT_ACCESS_SECRET;
    for (const secret of ["", "secret", "changeme", "development-secret", "123456", "x".repeat(64), process.env.JWT_REFRESH_SECRET]) {
      process.env.JWT_ACCESS_SECRET = secret;
      assert.throws(tokens.validateJwtConfiguration);
    }
    process.env.JWT_ACCESS_SECRET = strong;
    for (const lifetime of ["", "0", "-1s", "bad", "900", "8d"]) {
      process.env.JWT_ACCESS_EXPIRES_IN = lifetime;
      assert.throws(tokens.validateJwtConfiguration);
    }
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

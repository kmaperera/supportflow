const { test } = require("node:test");
const assert = require("node:assert/strict");
const cookieApp = require("./helpers/cookieApp");

function attributes(header, production, cleared = false) {
  assert.match(header, /^refreshToken=/);
  assert.match(header, /; HttpOnly/);
  assert.match(header, /; SameSite=Lax/);
  assert.match(header, /; Path=\/api\/v1\/auth/);
  assert.equal(header.includes("; Secure"), production);
  assert.doesNotMatch(header, /; Domain=|; Max-Age=/);
  const expiry = new Date(header.match(/Expires=([^;]+)/)[1]);
  assert.ok(cleared ? expiry < new Date() : expiry > new Date());
}

test("actual cookie issuance, rotation, failure, revocation and deletion in development/production", async t => {
  const { app, records } = await cookieApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/auth`;
  const post = (path, body, cookie) => fetch(base + path, { method: "POST", headers: {
    "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const credentials = { email: "cookie@example.com", password: "CookieFixture123!" };
  for (const environment of ["development", "production"]) {
    process.env.NODE_ENV = environment;
    const secure = environment === "production";
    const login = await post("/login", credentials);
    assert.equal(login.status, 200);
    const header = login.headers.get("set-cookie");
    attributes(header, secure);
    const cookie = header.split(";")[0];
    const raw = decodeURIComponent(cookie.slice("refreshToken=".length));
    const decoded = require("../src/utils/jwt").verifyRefreshToken(raw);
    assert.equal(new Date(header.match(/Expires=([^;]+)/)[1]).getTime(), decoded.exp * 1000);
    assert.equal(records.at(-1).expires_at.getTime(), decoded.exp * 1000);
    const body = await login.json();
    assert.equal(body.data.refreshToken, undefined);
    assert.ok(body.data.accessToken);
    const me = await fetch(base + "/me", { headers: { Authorization: `Bearer ${body.data.accessToken}` } });
    assert.equal(me.status, 200);
    const refreshed = await post("/refresh", undefined, cookie);
    assert.equal(refreshed.status, 200);
    attributes(refreshed.headers.get("set-cookie"), secure);
    const replacement = refreshed.headers.get("set-cookie").split(";")[0];
    assert.notEqual(replacement, cookie);
    assert.equal((await refreshed.json()).data.refreshToken, undefined);
    const stale = await post("/refresh", undefined, cookie);
    assert.equal(stale.status, 401);
    assert.equal(stale.headers.get("set-cookie"), null);
    const logout = await post("/logout", undefined, replacement);
    assert.equal(logout.status, 200); attributes(logout.headers.get("set-cookie"), secure, true);
    assert.equal((await post("/refresh", undefined, replacement)).status, 401);
    const staleLogout = await post("/logout", undefined, "refreshToken=unknown-fixture");
    assert.equal(staleLogout.status, 200); attributes(staleLogout.headers.get("set-cookie"), secure, true);
    const sessions = [];
    for (let i = 0; i < 2; i++) sessions.push((await post("/login", credentials)).headers.get("set-cookie").split(";")[0]);
    const all = await post("/logout-all", undefined, sessions[0]);
    assert.equal(all.status, 200); attributes(all.headers.get("set-cookie"), secure, true);
    for (const value of sessions) assert.equal((await post("/refresh", undefined, value)).status, 401);
    assert.ok(records.every(row => row.revoked_at));
  }
  for (const [email, status] of [["cookie@example.com", 401], ["nobody@example.com", 401], ["inactive@example.com", 403], ["bad", 422], ["nobody@example.com", 401], ["cookie@example.com", 429]]) {
    const response = await post("/login", { email, password: email === "inactive@example.com" ? "CookieFixture123!" : "WrongFixture123!" });
    assert.equal(response.status, status);
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { clientOrigin, corsPolicy } = require("../src/config/cors");

test("origin configuration is exact, normalized and closed on invalid production config", () => {
  assert.equal(clientOrigin({ CLIENT_URL: " https://app.example.com/ " }), "https://app.example.com");
  assert.equal(clientOrigin({ NODE_ENV: "development" }), "http://localhost:5173");
  for (const CLIENT_URL of [undefined, "", "*", "null", "https://*.example.com", "https://user:pass@example.com", "https://example.com/path", "https://example.com/?x=1", "https://example.com/#x", "file:///x"]) {
    assert.throws(() => clientOrigin({ NODE_ENV: "production", CLIENT_URL }), /CLIENT_URL/);
  }
  const policy = corsPolicy({ CLIENT_URL: "http://localhost:5173" });
  for (const origin of ["null", "https://evil.example", "http://localhost:5174", "http://127.0.0.1:5173", "http://localhost:5173.evil.example"]) {
    policy.rest.origin(origin, (error, value) => { assert.equal(error, null); assert.equal(value, false); });
    policy.socket.allowRequest({ headers: { origin } }, (error, value) => { assert.equal(error, null); assert.equal(value, false); });
  }
  policy.socket.allowRequest({ headers: {} }, (error, value) => assert.equal(value, true));
});

test("real REST and Socket.IO allow only the configured browser origin", async t => {
  const { app } = await require("./helpers/cookieApp")();
  const pool = require("../src/config/database");
  t.mock.method(pool, "query", async () => [[]]);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const origin = process.env.CLIENT_URL;
  const io = require("../src/config/socket").initializeSocket(server);
  t.after(() => new Promise(resolve => io.close(resolve)));
  const check = response => {
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
    assert.equal(response.headers.get("access-control-expose-headers"), "Content-Disposition");
    assert.match(response.headers.get("vary"), /Origin/);
  };
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    const response = await fetch(base + "/api/v1/tickets", { method: "OPTIONS", headers: { Origin: origin,
      "Access-Control-Request-Method": method, "Access-Control-Request-Headers": "Authorization,Content-Type" } });
    assert.equal(response.status, 204); check(response);
    assert.ok(response.headers.get("access-control-allow-methods").split(",").includes(method));
    assert.equal(response.headers.get("access-control-allow-headers"), "Content-Type,Authorization");
    assert.equal(response.headers.get("ratelimit"), null);
  }
  for (const value of [undefined, "null", "https://evil.example"]) {
    const response = await fetch(base + "/api/v1/health", { headers: value ? { Origin: value } : {} });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  }
  const login = await fetch(base + "/api/v1/auth/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ email: "cookie@example.com", password: "CookieFixture123!" }) });
  assert.equal(login.status, 200); check(login);
  const token = (await login.json()).data.accessToken;
  for (const [path, status, auth] of [["/api/v1/auth/me", 401, false], ["/api/v1/reports/tickets", 403, true], ["/missing", 404, false]]) {
    const response = await fetch(base + path, { headers: { Origin: origin, ...(auth ? { Authorization: `Bearer ${token}` } : {}) } });
    assert.equal(response.status, status); check(response);
  }
  t.mock.method(pool, "query", async () => { throw Error("fixture failure"); });
  t.mock.method(console, "error", () => {});
  const failed = await fetch(base + "/api/v1/health", { headers: { Origin: origin } });
  assert.equal(failed.status, 500); check(failed);
  for (let i = 0; i < 6; i++) {
    const response = await fetch(base + "/api/v1/auth/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{}" });
    assert.equal(response.status, i < 5 ? 422 : 429); check(response);
  }
  const connect = require("socket.io-client").io;
  for (const transport of ["polling", "websocket"]) {
    for (const allowed of [true, false]) {
      const client = connect(base, { transports: [transport], extraHeaders: { Origin: allowed ? origin : "https://evil.example" }, auth: { token }, reconnection: false, timeout: 3000 });
      try {
        const connected = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(Error("Socket test timed out")), 5000);
          client.once("connect", () => { clearTimeout(timer); resolve(true); });
          client.once("connect_error", () => { clearTimeout(timer); resolve(false); });
        });
        assert.equal(connected, allowed, transport);
        if (allowed) {
          const notification = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error("Notification timed out")), 3000);
            client.once("notification:new", value => { clearTimeout(timer); resolve(value); });
          });
          io.to("user:1").emit("notification:new", { message: "CORS fixture" });
          assert.deepEqual(await notification, { message: "CORS fixture" });
        }
      } finally { client.disconnect(); }
    }
  }
});

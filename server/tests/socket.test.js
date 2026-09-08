const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

test("socket initialization, authentication and private rooms use trusted identity", async () => {
  let middleware, connected, options, count = 0;
  let decoded = { sub: "5", role: "ADMIN" };
  let user = { id: 5, role: "EMPLOYEE", is_active: true };
  let verificationFailure = false;
  let databaseFailure = false;
  const env = { CLIENT_URL: "http://localhost:5173", NODE_ENV: "test" };
  const context = { module: { exports: {} }, process: { env }, console,
    require(name) {
      if (name.includes("constants/roles")) return require("../src/constants/roles");
      if (name === "socket.io") return { Server: class {
        constructor(server, config) { options = config; count++; }
        use(fn) { middleware = fn; }
        on(event, fn) { assert.equal(event, "connection"); connected = fn; }
      } };
      if (name.includes("jwt")) return { verifyAccessToken(token) {
        assert.equal(token, "test-token");
        if (verificationFailure) throw new Error("Expired/invalid token details");
        return decoded;
      } };
      return { async findById(id) {
        assert.equal(id, decoded.sub);
        if (databaseFailure) throw new Error("Private database details");
        return user;
      } };
    },
  };
  vm.runInNewContext(fs.readFileSync("src/config/socket.js", "utf8"), context);
  const { initializeSocket, getIO } = context.module.exports;
  assert.throws(getIO, /has not been initialized/);
  env.CLIENT_URL = "*";
  assert.throws(() => initializeSocket({}), /CLIENT_URL/);
  env.CLIENT_URL = "http://localhost:5173";
  const server = {};
  assert.equal(initializeSocket(server), getIO());
  assert.equal(initializeSocket(server), getIO());
  assert.equal(count, 1);
  assert.throws(() => initializeSocket({}), /another server/);
  assert.equal(options.cors.origin, env.CLIENT_URL);
  assert.equal(options.cors.credentials, true);
  async function authenticate(token = "test-token") {
    const socket = { handshake: { auth: { token, userId: 999, role: "ADMIN" } } };
    let error, calls = 0;
    await middleware(socket, value => { error = value; calls++; });
    assert.equal(calls, 1);
    return { socket, error };
  }
  const accepted = await authenticate();
  assert.equal(accepted.error, undefined);
  assert.equal(accepted.socket.user.id, 5);
  assert.equal(accepted.socket.user.role, "EMPLOYEE");
  const rooms = [], handlers = [];
  accepted.socket.join = room => rooms.push(room);
  accepted.socket.on = event => handlers.push(event);
  connected(accepted.socket);
  assert.deepEqual(rooms, ["user:5"]);
  assert.deepEqual(handlers, ["disconnect"]);
  for (const token of [null, "", "   ", 123]) assert.equal((await authenticate(token)).error.message, "Authentication error");
  verificationFailure = true;
  assert.equal((await authenticate()).error.message, "Authentication error");
  verificationFailure = false;
  for (const sub of [0, "0", "-1", "18446744073709551616"]) {
    decoded = { sub };
    assert.equal((await authenticate()).error.message, "Authentication error");
  }
  decoded = { sub: "5" };
  for (const unavailable of [null, { id: 5, is_active: false },
    { id: 5, role: "EMPLOYEE", is_active: "0" },
    { id: 6, role: "EMPLOYEE", is_active: true },
    { id: 5, role: "UNKNOWN", is_active: true }]) {
    user = unavailable;
    assert.equal((await authenticate()).error.message, "Authentication error");
  }
  databaseFailure = true;
  assert.equal((await authenticate()).error.message, "Authentication error");
  assert.equal(typeof require("socket.io").Server, "function");
});

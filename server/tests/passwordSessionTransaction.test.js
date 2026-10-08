const { test } = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const tokens = require("../src/modules/auth/refreshToken.repository");
const passwords = require("../src/utils/password");

test("password update and refresh revocation commit together or roll back", async t => {
  t.mock.method(passwords, "comparePassword", async value => value === "CurrentFixture123!");
  t.mock.method(passwords, "hashPassword", async () => "fixture-hash");
  const service = require("../src/modules/auth/auth.service");
  t.mock.method(users, "findById", async () => ({ id: 1, password_hash: "old-fixture-hash" }));
  for (const fail of [false, true]) {
    const calls = [];
    const connection = {
      async beginTransaction() { calls.push("begin"); },
      async commit() { calls.push("commit"); },
      async rollback() { calls.push("rollback"); },
      release() { calls.push("release"); },
    };
    t.mock.method(pool, "getConnection", async () => connection);
    t.mock.method(users, "updatePassword", async (id, hash, db) => {
      assert.equal(db, connection); assert.equal(id, 1); assert.equal(hash, "fixture-hash"); calls.push("password");
    });
    t.mock.method(tokens, "revokeAllForUser", async (id, db) => {
      assert.equal(db, connection); assert.equal(id, 1); calls.push("revoke");
      if (fail) throw Error("fixture revocation failure");
    });
    const changed = service.changePassword(1, "CurrentFixture123!", "NewFixture123!", "NewFixture123!");
    if (fail) await assert.rejects(changed, /fixture revocation failure/);
    else assert.deepEqual(await changed, { success: true });
    assert.deepEqual(calls, ["begin", "password", "revoke", fail ? "rollback" : "commit", "release"]);
  }
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const repository = require("../src/modules/auth/refreshToken.repository");

test("rotation commits only one replacement and rolls back if insertion fails", async t => {
  for (const mode of ["success", "replayed", "insert-failure"]) {
    const calls = [];
    const connection = {
      async beginTransaction() { calls.push("begin"); },
      async execute(sql, values) {
        if (sql.startsWith("UPDATE")) {
          assert.match(sql, /revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP/);
          assert.deepEqual(values, [7, 1]); calls.push("consume");
          return [{ affectedRows: mode === "replayed" ? 0 : 1 }];
        }
        calls.push("insert"); assert.equal(values[1], "fixture-hash");
        if (mode === "insert-failure") throw Error("fixture insertion failure");
        return [{ insertId: 8 }];
      },
      async commit() { calls.push("commit"); },
      async rollback() { calls.push("rollback"); },
      release() { calls.push("release"); },
    };
    t.mock.method(pool, "getConnection", async () => connection);
    const operation = repository.rotate(7, { userId: 1, tokenHash: "fixture-hash", expiresAt: new Date() });
    if (mode === "insert-failure") await assert.rejects(operation, /fixture insertion failure/);
    else assert.equal(await operation, mode === "success");
    assert.deepEqual(calls, mode === "success" ? ["begin", "consume", "insert", "commit", "release"] : mode === "replayed" ? ["begin", "consume", "rollback", "release"] : ["begin", "consume", "insert", "rollback", "release"]);
  }
});

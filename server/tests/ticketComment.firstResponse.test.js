const { test } = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const tickets = require("../src/modules/tickets/ticket.repository");
const comments = require("../src/modules/tickets/ticketComment.repository");
const service = require("../src/modules/tickets/ticketComment.service");

function setup(t, { role = "TECHNICIAN", status = "ASSIGNED", assignedTo = 7, fail } = {}) {
  const events = [];
  const failure = new Error("Transaction failed");
  const step = (name, result) => async () => {
    events.push(name);
    if (fail === name) throw failure;
    return result;
  };
  const connection = {
    beginTransaction: step("begin"), commit: step("commit"), rollback: step("rollback"),
    release() { events.push("release"); },
  };
  t.mock.method(pool, "getConnection", step("connection", connection));
  for (const [name, event, result] of [
    ["lockById", "lock", { id: 5 }],
    ["findById", "ticket", { id: 5, created_by: 7, assigned_to: assignedTo, status }],
    ["setFirstResponseIfUnset", "timestamp", 0],
  ]) {
    t.mock.method(tickets, name, async (id, db) => {
      assert.equal(id, 5);
      assert.equal(db, connection);
      return step(event, result)();
    });
  }
  t.mock.method(comments, "createComment", async (data, db) => {
    assert.equal(db, connection);
    assert.deepEqual(data, { ticketId: 5, userId: 7, commentType: "PUBLIC", content: "Reply" });
    return step("insert", 11)();
  });
  t.mock.method(comments, "findById", async (id) => {
    assert.equal(id, 11);
    assert.equal(events.at(-1), "release");
    return step("fetch", { id: 11, ticket_id: 5, comment_type: "PUBLIC", content: "Reply" })();
  });
  return { events, failure, connection, user: { id: 7, role } };
}

for (const role of ["EMPLOYEE", "TECHNICIAN", "ADMIN"]) {
  test(`${role} PUBLIC reply uses one transaction with the appropriate timestamp behavior`, async (t) => {
    const { events, user } = setup(t, { role });
    const comment = await service.createPublicComment(5, " Reply ", user);
    assert.equal(comment.id, 11);
    assert.equal(comment.commentType, "PUBLIC");
    assert.deepEqual(events, ["connection", "begin", "lock", "ticket", "insert",
      ...(role === "EMPLOYEE" ? [] : ["timestamp"]), "commit", "release", "fetch"]);
  });
}

for (const fail of ["begin", "lock", "ticket", "insert", "timestamp", "commit"]) {
  test(`failure during ${fail} rolls back and releases`, async (t) => {
    const { events, user, failure } = setup(t, { fail });
    await assert.rejects(service.createPublicComment(5, "Reply", user), (error) => error === failure);
    assert.deepEqual(events.slice(-2), ["rollback", "release"]);
    assert.equal(events.includes("fetch"), false);
  });
}

test("rollback failure preserves the original error and releases the connection", async (t) => {
  const { events, user, failure, connection } = setup(t, { fail: "timestamp" });
  connection.rollback = async () => { throw new Error("Rollback failed"); };
  await assert.rejects(service.createPublicComment(5, "Reply", user), (error) => error === failure);
  assert.equal(events.at(-1), "release");
});

for (const options of [
  { status: "RESOLVED" }, { status: "CLOSED" }, { assignedTo: null }, { assignedTo: 8 },
]) {
  test(`rejected PUBLIC reply cannot write: ${JSON.stringify(options)}`, async (t) => {
    const { events, user } = setup(t, options);
    await assert.rejects(service.createPublicComment(5, "Reply", user), { statusCode: options.status ? 409 : 404 });
    assert.equal(events.includes("insert"), false);
    assert.equal(events.includes("timestamp"), false);
    assert.deepEqual(events.slice(-2), ["rollback", "release"]);
  });
}

test("invalid content rolls back without inserting or setting the timestamp", async (t) => {
  const { events, user } = setup(t);
  await assert.rejects(service.createPublicComment(5, " ", user), { statusCode: 400 });
  assert.equal(events.includes("insert"), false);
  assert.equal(events.includes("timestamp"), false);
  assert.deepEqual(events.slice(-2), ["rollback", "release"]);
});

test("internal notes never acquire a transaction or update first response", async (t) => {
  const acquire = t.mock.method(pool, "getConnection", async () => { throw new Error("Unexpected transaction"); });
  const timestamp = t.mock.method(tickets, "setFirstResponseIfUnset", async () => { throw new Error("Unexpected timestamp update"); });
  t.mock.method(tickets, "findById", async () => ({ assigned_to: 7, status: "ASSIGNED" }));
  t.mock.method(comments, "createComment", async (data) => {
    assert.equal(data.commentType, "INTERNAL");
    return 11;
  });
  t.mock.method(comments, "findById", async () => ({ id: 11, comment_type: "INTERNAL" }));
  for (const role of ["TECHNICIAN", "ADMIN"]) {
    assert.equal((await service.createInternalNote(5, "Note", { id: 7, role })).commentType, "INTERNAL");
  }
  assert.equal(acquire.mock.callCount(), 0);
  assert.equal(timestamp.mock.callCount(), 0);
});

test("first response SQL is conditional and status transitions retain COALESCE", async () => {
  for (const affectedRows of [0, 1]) {
    const db = { async query(sql, values) {
      assert.equal(sql.replace(/\s+/g, " ").trim(),
        "UPDATE tickets SET first_response_at = CURRENT_TIMESTAMP WHERE id = ? AND first_response_at IS NULL");
      assert.deepEqual(values, [5]);
      return [{ affectedRows }];
    } };
    assert.equal(await tickets.setFirstResponseIfUnset(5, db), affectedRows);
  }
  await tickets.updateWorkingStatus(5, "IN_PROGRESS", true, { async query(sql, values) {
    assert.match(sql, /first_response_at = COALESCE\(first_response_at, CURRENT_TIMESTAMP\)/);
    assert.deepEqual(values, ["IN_PROGRESS", 5]);
    return [{ affectedRows: 1 }];
  } });
});

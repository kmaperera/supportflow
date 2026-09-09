const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/ticketFeedback/ticketFeedback.service");
const pool = require("../src/config/database");
const tickets = require("../src/modules/tickets/ticket.repository");
const repository = require("../src/modules/ticketFeedback/ticketFeedback.repository");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

function fixture(t) {
  const state = { ticket: { id: "7", created_by: "1", status: "CLOSED" }, feedback: null, writes: 0, commits: 0, rollbacks: 0, releases: 0 };
  const connection = { async beginTransaction() {}, async commit() { state.commits++; }, async rollback() { state.rollbacks++; }, release() { state.releases++; } };
  t.mock.method(pool, "getConnection", async () => connection);
  t.mock.method(tickets, "lockById", async (id, db) => { assert.equal(db, connection); return state.ticket; });
  t.mock.method(tickets, "findById", async (id, db) => { assert.equal(db, connection); return state.ticket; });
  t.mock.method(repository, "findByTicketId", async (id, db) => { assert.equal(db, connection); return state.feedback; });
  t.mock.method(repository, "create", async (data, db) => {
    assert.equal(db, connection); state.writes++;
    state.feedback = { ticket_id: data.ticketId, user_id: data.userId, rating: data.rating, comment: data.comment, created_at: "created", updated_at: "created" };
  });
  t.mock.method(repository, "updateByTicketId", async (data, db) => {
    assert.equal(db, connection); state.writes++;
    Object.assign(state.feedback, { rating: data.rating, comment: data.comment, updated_at: "updated" });
  });
  return state;
}
const input = { ticketId: "7", userId: "1", userRole: "EMPLOYEE", rating: 5 };

test("feedback creates, updates and preserves timestamps for identical PUTs", async t => {
  const state = fixture(t);
  assert.deepEqual(await service.saveTicketFeedback({ ...input, comment: "  Thanks  " }),
    { ticketId: 7, rating: 5, comment: "Thanks", createdAt: "created", updatedAt: "created" });
  await service.saveTicketFeedback({ ...input, comment: "Thanks" });
  assert.equal(state.writes, 1);
  assert.deepEqual(await service.saveTicketFeedback({ ...input, rating: 3, comment: "   " }),
    { ticketId: 7, rating: 3, comment: null, createdAt: "created", updatedAt: "updated" });
  assert.equal(state.feedback.user_id, "1");
  assert.equal(state.writes, 2);
  assert.equal(state.commits, 3);
  assert.equal(state.releases, 3);
});

test("feedback rejects nonowners, nonclosed states and corrupted ownership without writes", async t => {
  const state = fixture(t);
  state.ticket.created_by = "9";
  await assert.rejects(service.saveTicketFeedback(input), { statusCode: 404 });
  state.ticket.created_by = "1";
  for (const status of ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "REOPENED"]) {
    state.ticket.status = status;
    await assert.rejects(service.saveTicketFeedback(input), { statusCode: 409 });
  }
  state.ticket.status = "CLOSED";
  state.feedback = { user_id: "9" };
  await assert.rejects(service.saveTicketFeedback(input), { statusCode: 409 });
  state.ticket = null;
  await assert.rejects(service.saveTicketFeedback(input), { statusCode: 404 });
  assert.equal(state.writes, 0);
  assert.equal(state.commits, 0);
  assert.equal(state.rollbacks, 9);
  assert.equal(state.releases, 9);
});

test("feedback validates inputs and rolls back repository failures", async t => {
  const state = fixture(t);
  for (const rating of [0, 6, -1, 4.5, "5", null, undefined]) await assert.rejects(service.saveTicketFeedback({ ...input, rating }), { statusCode: 422 });
  for (const comment of [null, 5, {}, "x".repeat(1001)]) await assert.rejects(service.saveTicketFeedback({ ...input, comment }), { statusCode: 422 });
  for (const ticketId of [0, "1 OR 1=1", "18446744073709551616"]) await assert.rejects(service.saveTicketFeedback({ ...input, ticketId }), { statusCode: 422 });
  for (const userRole of ["TECHNICIAN", "ADMIN", "OTHER"]) await assert.rejects(service.saveTicketFeedback({ ...input, userRole }), { statusCode: 403 });
  assert.equal(state.releases, 0);
  const failure = new Error("write failed");
  t.mock.method(repository, "create", async () => { throw failure; });
  await assert.rejects(service.saveTicketFeedback(input), error => error === failure);
  assert.equal(state.rollbacks, 1);
  assert.equal(state.releases, 1);
});

test("feedback PUT authenticates, validates body and returns a consistent save response", async t => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "feedback-save-test"; });
  t.after(() => variables.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }));
  const app = require("../src/app");
  const state = fixture(t);
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "EMPLOYEE", 2: "TECHNICIAN", 3: "ADMIN", 4: "EMPLOYEE" }[id], is_active: 1 }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/tickets/7/feedback`;
  const put = (actor, body = { rating: 5 }, suffix = "") => fetch(url + suffix, { method: "PUT", headers: { "content-type": "application/json",
    ...(actor ? { authorization: `Bearer ${jwt.sign({}, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}` } : {}) }, body: JSON.stringify(body) });
  assert.equal((await put(null)).status, 401);
  for (const actor of [2, 3]) assert.equal((await put(actor)).status, 403);
  for (const body of [{}, { rating: "5" }, { rating: 0 }, { rating: 6 }, { rating: 4.5 }, { rating: null }, { rating: 5, comment: null }, { rating: 5, comment: "x".repeat(1001) }]) assert.equal((await put(1, body)).status, 422);
  for (const key of ["ticketId", "userId", "employeeId", "requesterId", "createdAt", "updatedAt", "role"]) assert.equal((await put(1, { rating: 5, [key]: 1 })).status, 422);
  assert.equal((await put(1, { rating: 5 }, "?userId=4")).status, 422);
  assert.equal(state.writes, 0);
  assert.equal((await put(4)).status, 404);
  state.ticket.status = "RESOLVED";
  assert.equal((await put(1)).status, 409);
  state.ticket.status = "CLOSED";
  const response = await put(1, { rating: 5, comment: "  Thanks  " });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, message: "Ticket feedback saved successfully", data: { feedback: {
    ticketId: 7, rating: 5, comment: "Thanks", createdAt: "created", updatedAt: "created" } } });
  assert.equal((await put(1, { rating: 4 })).status, 200);
  assert.equal(state.feedback.comment, null);
  assert.equal(state.writes, 2);
});

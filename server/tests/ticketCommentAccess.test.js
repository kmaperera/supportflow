const { test } = require("node:test");
const assert = require("node:assert/strict");
const access = require("../src/modules/tickets/ticketCommentAccess.service");
const ticketRepository = require("../src/modules/tickets/ticket.repository");
const commentRepository = require("../src/modules/tickets/ticketComment.repository");
const service = require("../src/modules/tickets/ticketComment.service");

test("read access and internal visibility follow trusted roles", () => {
  const ticket = { id: 5, created_by: 3, assigned_to: 7 };
  for (const [role, id, includeInternal] of [
    ["ADMIN", 9, true], ["EMPLOYEE", "3", false], ["TECHNICIAN", "7", true],
  ]) {
    const user = { id, role, includeInternal: true, query: { includeInternal: true }, body: { includeInternal: true } };
    assert.equal(access.assertCanViewTicketComments(ticket, user), true);
    assert.deepEqual(access.getCommentVisibilityOptions(ticket, user), { includeInternal });
  }
  for (const role of ["EMPLOYEE", "TECHNICIAN"]) {
    assert.throws(() => access.getCommentVisibilityOptions(ticket, { id: 8, role }),
      { statusCode: 404, message: "Ticket not found" });
  }
  assert.equal(access.canViewInternalComments({ id: 3, role: "UNKNOWN" }), false);
  assert.throws(() => access.getCommentVisibilityOptions(ticket, { id: 3, role: "UNKNOWN" }), { statusCode: 403 });
});

test("malformed tickets and users fail closed", () => {
  const ticket = { id: 5, created_by: 3, assigned_to: null };
  const admin = { id: 9, role: "ADMIN" };
  for (const invalid of [null, [], {}, { ...ticket, id: 0 }, { ...ticket, created_by: undefined },
    { id: 5, created_by: 3 }, { ...ticket, assigned_to: 0 }, { ...ticket, assigned_to: {} }]) {
    assert.throws(() => access.getCommentVisibilityOptions(invalid, admin), { statusCode: 404 });
  }
  for (const user of [null, [], {}, { id: 0, role: "ADMIN" }, { id: 9 }, { id: 9, role: "" }]) {
    assert.throws(() => access.getCommentVisibilityOptions(ticket, user), { statusCode: 401 });
    assert.equal(access.canViewInternalComments(user), false);
  }
  const largeId = "18446744073709551615";
  assert.equal(access.assertCanViewTicketComments({ ...ticket, created_by: largeId },
    { id: largeId, role: "EMPLOYEE" }), true);
});

test("technicians can read unassigned conversations but cannot create comments", async (t) => {
  const pool = require("../src/config/database");
  t.mock.method(pool, "getConnection", async () => ({
    async beginTransaction() {}, async rollback() {}, release() {},
  }));
  t.mock.method(ticketRepository, "lockById", async () => ({ id: 5 }));
  const ticket = { id: 5, created_by: 3, assigned_to: null, status: "OPEN" };
  const user = { id: 7, role: "TECHNICIAN" };
  t.mock.method(ticketRepository, "findById", async () => ticket);
  t.mock.method(commentRepository, "findByTicketId", async () => []);
  const create = t.mock.method(commentRepository, "createComment", async () => 1);
  assert.deepEqual(access.getCommentVisibilityOptions(ticket, user), { includeInternal: true });
  assert.deepEqual(await service.getTicketComments(5, user), []);
  for (const assignedTo of [null, 8]) {
    ticket.assigned_to = assignedTo;
    await assert.rejects(service.createPublicComment(5, "Reply", user), { statusCode: 404 });
    await assert.rejects(service.createInternalNote(5, "Note", user), { statusCode: 404 });
  }
  await assert.rejects(service.createInternalNote(5, "Note", { id: 3, role: "EMPLOYEE" }), { statusCode: 403 });
  ticket.status = "CLOSED";
  await assert.rejects(service.createInternalNote(5, "Note", { id: 9, role: "ADMIN" }), { statusCode: 409 });
  assert.equal(create.mock.callCount(), 0);
});

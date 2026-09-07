const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validationResult } = require("express-validator");
const ticketRepository = require("../src/modules/tickets/ticket.repository");
const commentRepository = require("../src/modules/tickets/ticketComment.repository");
const service = require("../src/modules/tickets/ticketComment.service");
const controller = require("../src/modules/tickets/ticketComment.controller");
const { getTicketCommentsValidation } = require("../src/modules/tickets/ticketComment.validation");

test("comment access follows ticket ownership and assignment", async (t) => {
  let ticket = { id: 5, created_by: 3, assigned_to: 7 };
  const findTicket = t.mock.method(ticketRepository, "findById", async () => ticket);
  const findComments = t.mock.method(commentRepository, "findByTicketId", async () => []);
  for (const [role, id, includeInternal] of [
    ["EMPLOYEE", "3", false], ["TECHNICIAN", "7", true], ["ADMIN", 9, true],
  ]) {
    assert.deepEqual(await service.getTicketComments("5", { id, role }), []);
    assert.deepEqual(findComments.mock.calls.at(-1).arguments, ["5", { includeInternal }]);
  }
  for (const user of [{ id: 4, role: "EMPLOYEE" }, { id: 8, role: "TECHNICIAN" }]) {
    await assert.rejects(service.getTicketComments(5, user), { statusCode: 404, message: "Ticket not found" });
  }
  assert.equal(findComments.mock.callCount(), 3);
  ticket.assigned_to = null;
  await service.getTicketComments(5, { id: 8, role: "TECHNICIAN" });
  assert.deepEqual(findComments.mock.calls.at(-1).arguments, [5, { includeInternal: true }]);
  ticket = null;
  await assert.rejects(service.getTicketComments(5, { id: 9, role: "ADMIN" }), { statusCode: 404 });
  assert.equal(findTicket.mock.callCount(), 7);
  assert.equal(findComments.mock.callCount(), 4);
});

test("invalid IDs, missing authentication, and unknown roles never read comments", async (t) => {
  const findTicket = t.mock.method(ticketRepository, "findById");
  const findComments = t.mock.method(commentRepository, "findByTicketId");
  for (const id of [0, -1, 1.5, "0", "-1", "1.5", "1e2", " 1", null, {}, "18446744073709551616"]) {
    await assert.rejects(service.getTicketComments(id, { id: 3, role: "ADMIN" }), { statusCode: 400 });
  }
  for (const user of [undefined, {}, { id: 3 }, { role: "ADMIN" }, { id: 0, role: "ADMIN" }]) {
    await assert.rejects(service.getTicketComments(5, user), { statusCode: 401 });
  }
  await assert.rejects(service.getTicketComments(5, { id: 3, role: "OTHER" }), { statusCode: 403 });
  assert.equal(findTicket.mock.callCount(), 0);
  assert.equal(findComments.mock.callCount(), 0);
});

test("response mapping preserves repository order and exposes only safe fields", async (t) => {
  t.mock.method(ticketRepository, "findById", async () => ({ id: 5, created_by: 3, assigned_to: null }));
  const row = {
    id: 10, ticket_id: 5, user_id: 3, comment_type: "PUBLIC", content: "Hello",
    created_at: "2026-09-01", updated_at: "2026-09-01", author_first_name: "Test",
    author_last_name: "User", author_email: "test@example.com", author_role: "EMPLOYEE",
    author_profile_image_url: null, password_hash: "secret", private_field: "secret",
  };
  t.mock.method(commentRepository, "findByTicketId", async () => [row, { ...row, id: 11 }]);
  assert.deepEqual(await service.getTicketComments(5, { id: 3, role: "EMPLOYEE" }), [10, 11].map((id) => ({
    id, ticketId: 5, commentType: "PUBLIC", content: "Hello",
    createdAt: "2026-09-01", updatedAt: "2026-09-01",
    author: { id: 3, firstName: "Test", lastName: "User", email: "test@example.com",
      role: "EMPLOYEE", profileImageUrl: null },
  })));
});

test("validation rejects invalid IDs and all visibility query controls", async () => {
  for (const [id, query, valid] of [
    ["5", {}, true], ["0", {}, false], ["1.2", {}, false],
    ["5", { includeInternal: "true" }, false], ["5", { commentType: "INTERNAL" }, false],
    ["5", { includeInternal: { value: "true" } }, false],
  ]) {
    const req = { params: { id }, query };
    for (const validation of getTicketCommentsValidation) await validation.run(req);
    assert.equal(validationResult(req).isEmpty(), valid);
  }
});

test("controller returns HTTP 200 for an empty conversation and forwards errors", async (t) => {
  const getComments = t.mock.method(service, "getTicketComments", async () => []);
  const req = { params: { id: "5" }, user: { id: 3, role: "EMPLOYEE" }, query: { includeInternal: "true" } };
  let status;
  let body;
  const res = { status(value) { status = value; return this; }, json(value) { body = value; } };
  await controller.getTicketComments(req, res, (error) => { throw error; });
  assert.equal(status, 200);
  assert.deepEqual(body, { success: true, message: "Ticket comments retrieved successfully", data: { comments: [] } });
  assert.deepEqual(getComments.mock.calls[0].arguments, ["5", req.user]);
  const failure = new Error("Repository failure");
  getComments.mock.mockImplementation(async () => { throw failure; });
  let forwarded;
  await controller.getTicketComments(req, res, (error) => { forwarded = error; });
  assert.equal(forwarded, failure);
});

test("repository filters public comments and orders by creation time then ID", async () => {
  for (const includeInternal of [false, true]) {
    const rows = [];
    const db = { async query(sql, values) {
      assert.match(sql, /ORDER BY c\.created_at ASC, c\.id ASC/);
      assert.equal(sql.includes("AND c.comment_type = ?"), !includeInternal);
      assert.deepEqual(values, includeInternal ? [5] : [5, "PUBLIC"]);
      return [rows];
    } };
    assert.equal(await commentRepository.findByTicketId(5, { includeInternal }, db), rows);
  }
});

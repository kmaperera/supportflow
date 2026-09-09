const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/knowledgeBase/knowledgeBaseCategory.service");
const repository = require("../src/modules/knowledgeBase/knowledgeBaseCategory.repository");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

test("category edits preserve omitted fields, handle conflicts and make status changes idempotent", async (t) => {
  let row = { id: 5, name: "Network", description: "Guides", is_active: 1, created_at: "created", updated_at: "updated" };
  const db = {};
  t.mock.method(repository, "findById", async (id, connection) => {
    assert.equal(connection, db);
    return String(id) === "5" ? { ...row } : null;
  });
  let duplicate = null;
  t.mock.method(repository, "findByName", async () => duplicate);
  let failure;
  const edit = t.mock.method(repository, "updateById", async (id, values, connection) => {
    assert.equal(connection, db);
    if (failure) throw failure;
    row = { ...row, ...values };
    return 1;
  });
  const status = t.mock.method(repository, "setActiveStatus", async (id, value, connection) => {
    assert.equal(connection, db);
    row.is_active = value;
    return 1;
  });
  for (const id of [0, -1, 1.5, "abc", null, "18446744073709551616", Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(service.updateCategory(id, { name: "Valid" }, db), { statusCode: 422 });
    await assert.rejects(service.setCategoryActiveStatus(id, false, db), { statusCode: 422 });
  }
  for (const values of [{}, [], { name: null }, { name: " " }, { name: 1 }, { name: "a".repeat(101) },
    { description: false }, { description: "x".repeat(256) }, { isActive: false }, { name: undefined }]) {
    await assert.rejects(service.updateCategory(5, values, db), { statusCode: 422 });
  }
  for (const value of ["true", "false", 1, 0, null, undefined]) {
    await assert.rejects(service.setCategoryActiveStatus(5, value, db), { statusCode: 422 });
  }
  await assert.rejects(service.updateCategory(99, { name: "Valid" }, db), { statusCode: 404, message: "Knowledge Base category not found" });
  await assert.rejects(service.setCategoryActiveStatus(99, false, db), { statusCode: 404 });
  await service.updateCategory(5, { name: " Network " }, db);
  assert.equal(edit.mock.callCount(), 0);
  await service.updateCategory(5, { description: " " }, db);
  assert.equal(row.name, "Network");
  assert.equal(row.description, null);
  duplicate = { id: "5" };
  await service.updateCategory(5, { name: " network " }, db);
  assert.equal(row.name, "network");
  duplicate = { id: 6 };
  await assert.rejects(service.updateCategory(5, { name: "Other" }, db), { statusCode: 409 });
  duplicate = null;
  failure = Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
  await assert.rejects(service.updateCategory(5, { name: "Other" }, db), { statusCode: 409 });
  failure = new Error("database offline");
  await assert.rejects(service.updateCategory(5, { name: "Other" }, db), e => e === failure);
  await service.setCategoryActiveStatus(5, true, db);
  assert.equal(status.mock.callCount(), 0);
  assert.equal((await service.setCategoryActiveStatus(5, false, db)).isActive, false);
  await service.setCategoryActiveStatus(5, false, db);
  assert.equal(status.mock.callCount(), 1);
  assert.equal((await service.setCategoryActiveStatus(5, true, db)).isActive, true);
  assert.equal(status.mock.callCount(), 2);
});

test("PATCH routes require ADMIN, validate bodies and return mapped categories without article SQL", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "kb-update-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  const pool = require("../src/config/database");
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "ADMIN", 2: "TECHNICIAN", 3: "EMPLOYEE" }[id], is_active: 1 }));
  const row = { id: 5, name: "Network", description: "Guides", is_active: 1, created_at: "created", updated_at: "updated" };
  const query = t.mock.method(pool, "query", async (sql, values) => {
    assert.doesNotMatch(sql, /knowledge_base_articles|DELETE/);
    assert.match(sql, /knowledge_base_categories/);
    if (sql.startsWith("UPDATE")) {
      if (sql.includes("SET is_active")) row.is_active = values[0];
      else { row.name = values[0]; row.description = values[1]; }
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("WHERE name")) return [[]];
    return [String(values[0]) === "5" ? [{ ...row }] : []];
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/knowledge-base/categories`;
  const patch = (path, body, actor = 1) => fetch(base + path, { method: "PATCH", headers: {
    "content-type": "application/json", ...(actor ? { authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}` } : {}),
  }, body: JSON.stringify(body) });
  for (const [path, body] of [["/5", { name: "New name" }], ["/5/status", { isActive: false }]]) {
    assert.equal((await patch(path, body, null)).status, 401);
    for (const actor of [2, 3]) assert.equal((await patch(path, { ...body, role: "ADMIN" }, actor)).status, 403);
  }
  for (const id of ["0", "-1", "1.5", "abc", "18446744073709551616"]) {
    assert.equal((await patch(`/${id}`, { name: "Valid" })).status, 422);
    assert.equal((await patch(`/${id}/status`, { isActive: false })).status, 422);
  }
  for (const body of [{}, { name: " " }, { name: null }, { name: 1 }, { description: false }, { description: "x".repeat(256) }, { isActive: false }, { id: 5 }]) {
    assert.equal((await patch("/5", body)).status, 422);
  }
  for (const value of ["true", "false", 0, 1, null, undefined]) assert.equal((await patch("/5/status", { isActive: value })).status, 422);
  assert.equal((await patch("/5/status", { isActive: false, name: "Bad" })).status, 422);
  assert.equal(query.mock.callCount(), 0);
  assert.equal((await patch("/99", { name: "Valid" })).status, 404);
  assert.equal((await patch("/99/status", { isActive: false })).status, 404);
  const response = await patch("/5", { name: " Connectivity " });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, message: "Knowledge Base category updated successfully", data: {
    category: { id: 5, name: "Connectivity", description: "Guides", isActive: true, createdAt: "created", updatedAt: "updated" },
  } });
  for (const active of [false, false, true, true]) {
    const response = await patch("/5/status", { isActive: active });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.message, "Knowledge Base category status updated successfully");
    assert.equal(body.data.category.isActive, active);
  }
  assert.equal(query.mock.calls.filter(call => call.arguments[0].startsWith("UPDATE")).length, 3);
  assert.equal((await fetch(base + "/5", { method: "DELETE" })).status, 404);
});

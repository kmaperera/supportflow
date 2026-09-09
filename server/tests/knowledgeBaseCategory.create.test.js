const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const service = require("../src/modules/knowledgeBase/knowledgeBaseCategory.service");

const invalid = [
  {}, [], null, { name: "" }, { name: " " }, { name: "a" }, { name: "a".repeat(101) },
  ...[null, 1, true, {}, []].map(name => ({ name })),
  ...[1, true, {}, [], "a".repeat(256)].map(description => ({ name: "Network", description })),
  ...["id", "isActive", "is_active", "createdAt", "updatedAt"].map(key => ({ name: "Network", [key]: 1 })),
];

test("service validates before SQL and normalizes optional descriptions with injected connections", async () => {
  const noQuery = { async query() { assert.fail("Invalid input reached SQL"); } };
  for (const value of invalid) await assert.rejects(service.createCategory(value, noQuery), { statusCode: 422 });
  for (const description of [undefined, null, "   ", "  Details  "]) {
    let calls = 0;
    const normalized = description === "  Details  " ? "Details" : null;
    const db = { async query(sql, values) {
      calls++;
      if (calls === 1) { assert.deepEqual(values, ["Network"]); return [[]]; }
      if (calls === 2) { assert.deepEqual(values, ["Network", normalized]); return [{ insertId: 7 }]; }
      assert.deepEqual(values, [7]);
      return [[{ id: 7, name: "Network", description: normalized, is_active: 1, created_at: "created", updated_at: "updated" }]];
    } };
    assert.deepEqual(await service.createCategory({ name: "  Network  ", description }, db), {
      id: 7, name: "Network", description: normalized, isActive: true, createdAt: "created", updatedAt: "updated",
    });
    assert.equal(calls, 3);
  }
  const failure = new Error("connection failed");
  await assert.rejects(service.createCategory({ name: "Network" }, { async query() { throw failure; } }), e => e === failure);
});

test("registered creation endpoint enforces ADMIN, validation, duplicate conflicts and mapped 201 responses", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "kb-create-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key];
    else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "ADMIN", 2: "TECHNICIAN", 3: "EMPLOYEE" }[id], is_active: 1 }));
  let mode = "success";
  let inserted;
  const query = t.mock.method(pool, "query", async (sql, values) => {
    if (sql.includes("WHERE name = ?")) {
      assert.equal(values[0], "Network");
      return [mode === "duplicate" ? [{ id: 1, is_active: 0 }] : []];
    }
    if (sql.startsWith("INSERT")) {
      if (mode === "race") throw Object.assign(new Error("raw MySQL duplicate details"), { code: "ER_DUP_ENTRY" });
      inserted = values;
      return [{ insertId: 7 }];
    }
    assert.match(sql, /WHERE id = \? LIMIT 1/);
    return [[{ id: 7, name: inserted[0], description: inserted[1], is_active: 1,
      created_at: "created", updated_at: "updated", private_field: "hidden" }]];
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/knowledge-base`;
  const headers = actor => ({ "content-type": "application/json", ...(actor ? {
    authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {}) });
  const post = (body, actor = 1) => fetch(`${base}/categories`, { method: "POST", headers: headers(actor), body: JSON.stringify(body) });
  assert.equal((await post({ name: "Network" }, null)).status, 401);
  for (const actor of [2, 3]) assert.equal((await post({ name: "Network", role: "ADMIN" }, actor)).status, 403);
  for (const body of invalid.filter(value => value !== null)) assert.equal((await post(body)).status, 422);
  assert.equal(query.mock.callCount(), 0);
  const result = await post({ name: "  Network  ", description: "  " });
  assert.equal(result.status, 201);
  assert.deepEqual(await result.json(), { success: true, message: "Knowledge Base category created successfully",
    data: { category: { id: 7, name: "Network", description: null, isActive: true, createdAt: "created", updatedAt: "updated" } } });
  for (const duplicateMode of ["duplicate", "race"]) {
    mode = duplicateMode;
    const response = await post({ name: "Network" });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).message, "Knowledge Base category already exists");
  }
  for (const [method, path] of [["PATCH", "/categories/7/active"], ["DELETE", "/categories/7"]]) {
    assert.equal((await fetch(base + path, { method, headers: headers(1) })).status, 404);
  }
});

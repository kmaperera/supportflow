const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

test("ADMIN category listing includes inactive and zero-article categories; other roles cannot list", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "kb-list-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  const pool = require("../src/config/database");
  const users = require("../src/modules/users/user.repository");
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "ADMIN", 2: "EMPLOYEE", 3: "TECHNICIAN" }[id], is_active: 1 }));
  let rows = [
    { id: 1, name: "Active", description: "Guides", is_active: 1, created_at: "created", updated_at: "updated" },
    { id: 2, name: "Inactive", description: null, is_active: 0, created_at: "created", updated_at: "updated" },
    { id: 3, name: "Without articles", description: null, is_active: 1, created_at: "created", updated_at: "updated" },
  ];
  const query = t.mock.method(pool, "query", async sql => {
    assert.match(sql, /FROM knowledge_base_categories/);
    assert.match(sql, /ORDER BY name ASC/);
    // Listing must be independent of articles and must not filter inactive rows.
    assert.doesNotMatch(sql, /JOIN|WHERE|knowledge_base_articles|ticket_categories/i);
    return [rows];
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/knowledge-base/categories`;
  const get = actor => fetch(url, { headers: actor ? {
    authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {} });
  assert.equal((await get()).status, 401);
  assert.equal((await get(2)).status, 403);
  assert.equal((await get(3)).status, 403);
  assert.equal(query.mock.callCount(), 0);
  const response = await get(1);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true, message: "Knowledge Base categories retrieved successfully",
    data: { categories: rows.map(row => ({ id: row.id, name: row.name, description: row.description,
      isActive: row.is_active === 1, createdAt: row.created_at, updatedAt: row.updated_at })) },
  });
  rows = [];
  const empty = await get(1);
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()).data.categories, []);
});

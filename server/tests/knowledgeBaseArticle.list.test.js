const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/knowledgeBase/knowledgeBaseArticle.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

function database() {
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: 30 - i, category_id: 1, category_name: "Network",
    title: "Title", slug: `article-${i}`, status: i < 12 ? "PUBLISHED" : i < 20 ? "DRAFT" : "ARCHIVED",
    active: i < 10, view_count: 17, created_by: 7, published_at: null, created_at: "created", updated_at: "updated" }));
  const calls = [];
  return { calls, async query(sql, values) {
    calls.push({ sql, values });
    assert.match(sql, /^SELECT /);
    assert.doesNotMatch(sql, /a.content|UPDATE|INSERT|DELETE/);
    const filtered = sql.includes("WHERE");
    if (filtered) {
      assert.match(sql, /WHERE a.status = \? AND c.is_active = TRUE/);
      assert.equal(values[0], "PUBLISHED");
    }
    const visible = filtered ? rows.filter(row => row.status === "PUBLISHED" && row.active) : rows;
    if (sql.includes("COUNT(*)")) return [[{ total: String(visible.length) }]];
    assert.match(sql, /ORDER BY a.created_at DESC, a.id DESC LIMIT \? OFFSET \?/);
    const [limit, offset] = values.slice(-2);
    return [visible.slice(offset, offset + limit)];
  } };
}

test("list pagination and counts share visibility; invalid and unsupported options never query", async () => {
  for (const role of ["ADMIN", "EMPLOYEE", "TECHNICIAN"]) {
    const db = database();
    const result = await service.listArticles({ page: "2", limit: "6" }, { role }, db);
    assert.equal(result.pagination.totalRecords, role === "ADMIN" ? 30 : 10);
    assert.equal(result.articles.length, role === "ADMIN" ? 6 : 4);
    assert.equal(result.pagination.currentPage, 2);
    assert.equal(result.pagination.totalPages, role === "ADMIN" ? 5 : 2);
    assert.ok(result.articles.every(row => !("content" in row) && !("category_id" in row)));
    assert.equal(db.calls.length, 2);
    const empty = await service.listArticles({ page: 99 }, { role }, db);
    assert.deepEqual(empty.articles, []);
  }
  const noQuery = { async query() { assert.fail("Invalid options reached SQL"); } };
  for (const options of [{ page: 0 }, { page: -1 }, { page: "abc" }, { page: "1.5" }, { limit: 0 }, { limit: 1000 },
    { page: [] }, { limit: null }, { page: Number.MAX_SAFE_INTEGER, limit: 100 },
    ...["search", "q", "keyword", "categoryId", "category", "sort", "userRole"].map(key => ({ [key]: "x" }))]) {
    await assert.rejects(service.listArticles(options, { role: "ADMIN" }, noQuery), { statusCode: 422 });
  }
  await assert.rejects(service.listArticles({}, null, noQuery), { statusCode: 401 });
  const empty = await service.listArticles({}, { role: "EMPLOYEE" }, { async query(sql) {
    return sql.includes("COUNT(*)") ? [[{ total: 0 }]] : [[]];
  } });
  assert.deepEqual(empty.articles, []);
  assert.equal(empty.pagination.currentPage, 1);
  assert.equal(empty.pagination.limit, 10);
  assert.equal(empty.pagination.totalPages, 0);
});

test("collection endpoint authenticates and uses database roles for list and count visibility", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "kb-list-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "ADMIN", 2: "TECHNICIAN", 3: "EMPLOYEE" }[id], is_active: 1 }));
  const db = database();
  t.mock.method(pool, "query", db.query);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/knowledge-base/articles`;
  const get = (actor, query = "") => fetch(base + query, { headers: actor ? {
    authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {} });
  assert.equal((await get(null)).status, 401);
  for (const query of ["?page=0", "?limit=1000", "?page=abc", "?search=x", "?categoryId=1", "?page=1&page=2"]) {
    assert.equal((await get(1, query)).status, 422);
  }
  assert.equal(db.calls.length, 0);
  for (const actor of [1, 2, 3]) {
    const response = await get(actor);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.message, "Knowledge Base articles retrieved successfully");
    assert.equal(body.success, true);
    assert.equal(body.data.articles.length, 10);
    assert.equal(body.data.pagination.totalRecords, actor === 1 ? 30 : 10);
    assert.ok(body.data.articles.every(article => !("content" in article)));
  }
});

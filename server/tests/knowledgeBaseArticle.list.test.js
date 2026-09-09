const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/knowledgeBase/knowledgeBaseArticle.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

function database() {
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: 30 - i, category_id: i < 10 ? 1 : 2, category_name: "Network",
    title: i % 2 === 0 ? "Password guide" : "Title", content: i % 3 === 0 ? "Password body" : "Body",
    slug: `article-${i}`, status: i < 12 ? "PUBLISHED" : i < 20 ? "DRAFT" : "ARCHIVED",
    active: i < 10, view_count: 17, created_by: 7, published_at: null, created_at: "created", updated_at: "updated" }));
  const calls = [];
  return { calls, async query(sql, values) {
    calls.push({ sql, values });
    assert.match(sql, /^\s*SELECT /);
    if (sql.includes("FROM knowledge_base_categories")) {
      assert.match(sql, /WHERE id = \? LIMIT 1/);
      return [[1, 2, 3].includes(values[0]) ? [{ id: values[0], is_active: values[0] !== 2 }] : []];
    }
    assert.doesNotMatch(sql.split("FROM")[0], /a.content/);
    assert.doesNotMatch(sql, /UPDATE|INSERT|DELETE/);
    const filtered = sql.includes("a.status = ?");
    if (filtered) {
      assert.match(sql, /WHERE a.status = \? AND c.is_active = TRUE/);
      assert.equal(values[0], "PUBLISHED");
    }
    let visible = filtered ? rows.filter(row => row.status === "PUBLISHED" && row.active) : rows;
    if (sql.includes("LIKE")) {
      assert.match(sql, /\(a.title LIKE \? OR a.content LIKE \?\)/);
      const term = values[filtered ? 1 : 0].slice(1, -1).toLowerCase();
      assert.equal(values[filtered ? 1 : 0], values[filtered ? 2 : 1]);
      visible = visible.filter(row => row.title.toLowerCase().includes(term) || row.content.toLowerCase().includes(term));
    }
    if (sql.includes("a.category_id = ?")) {
      const index = (filtered ? 1 : 0) + (sql.includes("LIKE") ? 2 : 0);
      visible = visible.filter(row => row.category_id === values[index]);
    }
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
    ...["q", "keyword", "categoryId", "category", "sort", "userRole"].map(key => ({ [key]: "x" }))]) {
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
  for (const query of ["?page=0", "?limit=1000", "?page=abc", "?search=x&search=y", "?categoryId=0", "?page=1&page=2"]) {
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
  for (const actor of [1, 2, 3]) {
    const response = await get(actor, "?search=%20Password%20&page=2&limit=5");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.pagination.totalRecords, actor === 1 ? 20 : 7);
    assert.equal(body.data.articles.length, actor === 1 ? 5 : 2);
  }
  const empty = await get(2, "?search=missing");
  assert.equal(empty.status, 200);
  const emptyBody = await empty.json();
  assert.deepEqual(emptyBody.data.articles, []);
  assert.equal(emptyBody.data.pagination.totalRecords, 0);
  assert.equal(emptyBody.data.pagination.totalPages, 0);
  assert.equal((await get(1, `?search=${"x".repeat(201)}`)).status, 422);
  assert.equal((await get(1, "?search=%20%20")).status, 200);
  for (const actor of [1, 2, 3]) {
    const active = await get(actor, "?categoryId=1&search=password&page=2&limit=5");
    assert.equal(active.status, 200);
    const result = await active.json();
    assert.equal(result.data.pagination.totalRecords, 7);
    assert.equal(result.data.articles.length, 2);
    assert.ok(result.data.articles.every(article => article.categoryId === 1));
    const inactive = await get(actor, "?categoryId=2");
    assert.equal(inactive.status, 200);
    const hidden = await inactive.json();
    assert.equal(hidden.data.pagination.totalRecords, actor === 1 ? 20 : 0);
    if (actor !== 1) assert.deepEqual(hidden.data.articles, []);
  }
  const noArticles = await get(1, "?categoryId=3");
  assert.equal(noArticles.status, 200);
  assert.equal((await noArticles.json()).data.pagination.totalPages, 0);
  const missingCategory = await get(1, "?categoryId=99");
  assert.equal(missingCategory.status, 404);
  assert.equal((await missingCategory.json()).message, "Knowledge Base category not found");
  for (const value of ["", "0", "-1", "abc", "3.5", "9007199254740992", "1&categoryId=2"]) {
    assert.equal((await get(1, `?categoryId=${value}`)).status, 422);
  }
});

test("category filters validate before SQL and combine identical list/count predicates", async () => {
  const noQuery = { async query() { assert.fail("Invalid category queried database"); } };
  for (const categoryId of ["", 0, -1, "abc", 3.5, null, true, [], {}, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(service.listArticles({ categoryId }, { role: "ADMIN" }, noQuery), { statusCode: 422 });
  }
  for (const role of ["ADMIN", "EMPLOYEE", "TECHNICIAN"]) {
    const db = database();
    await service.listArticles({ categoryId: "1", search: "password", page: 2, limit: 5 }, { role }, db);
    assert.equal(db.calls.length, 3);
    assert.deepEqual(db.calls[0].values, [1]);
    const [list, count] = db.calls.slice(1);
    const expected = [...(role === "ADMIN" ? [] : ["PUBLISHED"]), "%password%", "%password%", 1];
    assert.deepEqual(list.values, [...expected, 5, 5]);
    assert.deepEqual(count.values, expected);
    assert.match(list.sql, /\(a.title LIKE \? OR a.content LIKE \?\) AND a.category_id = \?/);
    assert.equal(list.sql.split("WHERE")[1].split("ORDER BY")[0].trim(), count.sql.split("WHERE")[1].trim());
  }
});

test("search validation and bound list/count predicates preserve visibility and pagination", async () => {
  const noQuery = { async query() { assert.fail("Invalid search queried database"); } };
  for (const search of [null, 1, true, [], {}, "x".repeat(201)]) {
    await assert.rejects(service.listArticles({ search }, { role: "ADMIN" }, noQuery), { statusCode: 422 });
  }
  for (const search of [undefined, "", "   "]) {
    const db = database();
    await service.listArticles({ search }, { role: "EMPLOYEE" }, db);
    assert.ok(db.calls.every(call => !call.sql.includes("LIKE")));
  }
  for (const role of ["ADMIN", "EMPLOYEE", "TECHNICIAN"]) {
    const calls = [];
    const search = "x' OR 1=1 --";
    await service.listArticles({ search: ` ${search} `, page: "2", limit: "5" }, { role }, {
      async query(sql, values) {
        calls.push({ sql, values });
        assert.ok(!sql.includes(search));
        return sql.includes("COUNT(*)") ? [[{ total: 0 }]] : [[]];
      },
    });
    const filters = role === "ADMIN" ? [] : ["PUBLISHED"];
    assert.deepEqual(calls[0].values, [...filters, `%${search}%`, `%${search}%`, 5, 5]);
    assert.deepEqual(calls[1].values, [...filters, `%${search}%`, `%${search}%`]);
    assert.equal(calls[0].sql.split("WHERE")[1].split("ORDER BY")[0].trim(), calls[1].sql.split("WHERE")[1].trim());
  }
});

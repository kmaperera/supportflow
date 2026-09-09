const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/knowledgeBase/knowledgeBaseArticle.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

const row = { id: 10, category_id: 1, category_name: "Network", title: "VPN Setup", slug: "vpn-setup", content: "Body",
  status: "PUBLISHED", category_is_active: 1, view_count: 17, created_by: 7,
  published_at: "published", created_at: "created", updated_at: "updated" };

test("get service validates IDs and enforces the role/status/category visibility matrix", async () => {
  const noQuery = { async query() { assert.fail("Unexpected SQL"); } };
  for (const id of [0, -1, 1.5, "abc", null, undefined, true, "18446744073709551616"]) {
    await assert.rejects(service.getArticleById(id, { role: "ADMIN" }, noQuery), { statusCode: 422 });
  }
  await assert.rejects(service.getArticleById(10, null, noQuery), { statusCode: 401 });
  for (const role of ["ADMIN", "EMPLOYEE", "TECHNICIAN", "UNKNOWN"]) {
    for (const status of ["DRAFT", "PUBLISHED", "ARCHIVED"]) {
      for (const active of [true, 1, "1", false, 0, "0", null]) {
        let queries = 0;
        const db = { async query(sql, values) {
          queries++;
          assert.match(sql, /^\s*SELECT /);
          assert.match(sql, /c.is_active AS category_is_active/);
          assert.match(sql, /WHERE a.id = \? LIMIT 1/);
          assert.deepEqual(values, ["10"]);
          return [[{ ...row, status, category_is_active: active }]];
        } };
        const result = service.getArticleById("10", { role }, db);
        if (role === "ADMIN" || (role !== "UNKNOWN" && status === "PUBLISHED" && [true, 1, "1"].includes(active))) {
          const article = await result;
          assert.equal(article.status, status);
          assert.equal(article.viewCount, 17);
          assert.equal(article.content, "Body");
          assert.equal("category_is_active" in article, false);
          assert.equal("helpfulCount" in article, false);
        } else await assert.rejects(result, { statusCode: 404, message: "Knowledge Base article not found" });
        assert.equal(queries, 1);
      }
    }
  }
  await assert.rejects(service.getArticleById(99, { role: "ADMIN" }, { async query() { return [[]]; } }), { statusCode: 404 });
});

test("GET endpoint uses authenticated database role and hides unavailable articles without writes", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "kb-get-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "ADMIN", 2: "TECHNICIAN", 3: "EMPLOYEE" }[id], is_active: 1 }));
  let current = { ...row };
  const query = t.mock.method(pool, "query", async (sql, values) => {
    assert.match(sql, /^\s*SELECT .*FROM knowledge_base_articles AS a.*WHERE a.id = \? LIMIT 1/s);
    return [values[0] === "10" ? [{ ...current }] : []];
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/knowledge-base/articles`;
  const get = (actor = 1, id = "10") => fetch(`${base}/${id}?role=ADMIN`, { headers: actor ? {
    authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {} });
  assert.equal((await get(null)).status, 401);
  for (const id of ["0", "-1", "1.5", "abc", "18446744073709551616"]) assert.equal((await get(1, id)).status, 422);
  assert.equal(query.mock.callCount(), 0);
  const missing = await get(1, "99");
  assert.equal(missing.status, 404);
  const missingBody = await missing.json();
  for (const actor of [1, 2, 3]) {
    for (const status of ["DRAFT", "PUBLISHED", "ARCHIVED"]) {
      for (const active of [0, 1]) {
        current = { ...row, status, category_is_active: active };
        const response = await get(actor);
        if (actor === 1 || (status === "PUBLISHED" && active === 1)) {
          assert.equal(response.status, 200);
          assert.deepEqual(await response.json(), { success: true, message: "Knowledge Base article retrieved successfully", data: {
            article: { id: 10, categoryId: 1, categoryName: "Network", title: "VPN Setup", slug: "vpn-setup", content: "Body",
              status, viewCount: 17, createdBy: 7, publishedAt: "published", createdAt: "created", updatedAt: "updated" },
          } });
        } else {
          assert.equal(response.status, 404);
          assert.deepEqual(await response.json(), missingBody);
        }
      }
    }
  }
  assert.equal((await fetch(base)).status, 401);
});

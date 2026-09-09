const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/knowledgeBase/knowledgeBaseArticle.service");
const slugify = require("../src/utils/slugify");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");
const valid = { categoryId: 1, title: " VPN Setup ", content: " Body ", createdBy: "7" };

test("article service validates, checks categories, allocates slugs and handles races", async () => {
  for (const [field, values] of Object.entries({ categoryId: [0, -1, 1.5, "1", null, undefined],
    title: ["", " ", "ab", "a".repeat(201), 1, true, null, {}], content: ["", " ", null, 1, true] })) {
    for (const value of values) await assert.rejects(service.createArticle({ ...valid, [field]: value }, {
      async query() { assert.fail("Invalid input queried database"); },
    }), { statusCode: 422 });
  }
  assert.equal(slugify(" How to Reset Your Password! "), "how-to-reset-your-password");
  assert.equal(slugify(" Café --- Setup "), "cafe-setup");
  assert.equal(slugify("!!!"), "article");
  for (const [category, code] of [[null, 404], [{ is_active: 0 }, 409]]) {
    await assert.rejects(service.createArticle(valid, { async query() { return [category ? [category] : []]; } }), { statusCode: code });
  }
  let attempts = 0;
  let inserted;
  const db = { async query(sql, values) {
    assert.doesNotMatch(sql, /UPDATE|article_feedback/);
    if (sql.includes("FROM knowledge_base_categories")) return [[{ id: 1, is_active: 1 }]];
    if (sql.includes("WHERE a.slug")) return [values[0] === "vpn-setup" ? [{ id: 2 }] : []];
    if (sql.includes("INSERT")) {
      assert.doesNotMatch(sql, /status|view_count|published_at/);
      if (++attempts === 1) throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
      inserted = values;
      return [{ insertId: 9 }];
    }
    return [[{ id: 9, category_id: 1, category_name: "Network", title: inserted[1], slug: inserted[2],
      content: inserted[3], created_by: inserted[4], status: "DRAFT", view_count: 0,
      published_at: null, created_at: "created", updated_at: "updated" }]];
  } };
  const article = await service.createArticle(valid, db);
  assert.deepEqual(inserted, [1, "VPN Setup", "vpn-setup-3", "Body", "7"]);
  assert.equal(article.status, "DRAFT");
  assert.equal(article.viewCount, 0);
  assert.equal(article.publishedAt, null);
  assert.equal("created_by" in article, false);
  let races = 0;
  await assert.rejects(service.createArticle(valid, { async query(sql) {
    if (sql.includes("FROM knowledge_base_categories")) return [[{ is_active: 1 }]];
    if (sql.includes("INSERT")) { races++; throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" }); }
    return [[]];
  } }), { statusCode: 409 });
  assert.equal(races, 5);
});

test("article POST requires ADMIN, rejects controlled fields and creates repeated titles as drafts", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "kb-article-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "ADMIN", 2: "TECHNICIAN", 3: "EMPLOYEE" }[id], is_active: 1 }));
  const rows = [];
  const query = t.mock.method(pool, "query", async (sql, values) => {
    assert.doesNotMatch(sql, /UPDATE|article_feedback|notifications/);
    if (sql.includes("FROM knowledge_base_categories")) return [values[0] === 99 ? [] : [{ id: values[0], is_active: values[0] === 2 ? 0 : 1 }]];
    if (sql.includes("WHERE a.slug")) return [rows.filter(row => row.slug === values[0])];
    if (sql.includes("INSERT")) {
      assert.doesNotMatch(sql, /status|view_count|published_at/);
      rows.push({ id: rows.length + 1, category_id: values[0], category_name: "Network", title: values[1], slug: values[2],
        content: values[3], created_by: values[4], status: "DRAFT", view_count: 0, published_at: null, created_at: "created", updated_at: "updated" });
      return [{ insertId: rows.length }];
    }
    return [[rows[values[0] - 1]]];
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/knowledge-base/articles`;
  const body = { categoryId: 1, title: " VPN Setup ", content: " Body " };
  const post = (value = body, actor = 1) => fetch(url, { method: "POST", headers: {
    "content-type": "application/json", ...(actor ? { authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}` } : {}),
  }, body: JSON.stringify(value) });
  assert.equal((await post(body, null)).status, 401);
  for (const actor of [2, 3]) assert.equal((await post(body, actor)).status, 403);
  for (const key of ["slug", "status", "viewCount", "publishedAt", "createdBy", "userId", "authorId"]) {
    assert.equal((await post({ ...body, [key]: "spoofed" })).status, 422);
  }
  for (const value of [{ ...body, categoryId: "1" }, { ...body, title: false }, { ...body, content: " " }]) {
    assert.equal((await post(value)).status, 422);
  }
  assert.equal(query.mock.callCount(), 0);
  assert.equal((await post({ ...body, categoryId: 99 })).status, 404);
  assert.equal((await post({ ...body, categoryId: 2 })).status, 409);
  for (const slug of ["vpn-setup", "vpn-setup-2"]) {
    const response = await post();
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.success, true);
    assert.deepEqual(result.data.article, { id: rows.length, categoryId: 1, categoryName: "Network", title: "VPN Setup",
      slug, content: "Body", status: "DRAFT", viewCount: 0, createdBy: "1", publishedAt: null, createdAt: "created", updatedAt: "updated" });
  }
  assert.equal((await fetch(url)).status, 401);
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/knowledgeBase/knowledgeBaseArticle.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

function database() {
  const row = { id: 10, category_id: 1, category_name: "Network", title: "VPN Setup", slug: "vpn-setup",
    content: "Original", status: "PUBLISHED", view_count: 17, created_by: 7,
    published_at: "published", created_at: "created", updated_at: "updated" };
  const state = { row, writes: 0, slugs: [], collision: false, races: 0 };
  state.query = async (sql, values) => {
    assert.doesNotMatch(sql, /article_feedback|notifications|DELETE/);
    if (sql.includes("FROM knowledge_base_categories")) return [values[0] === 99 ? [] : [{ id: values[0], is_active: values[0] !== 2 }]];
    if (sql.includes("WHERE a.slug")) {
      state.slugs.push(values[0]);
      if (values[0] === row.slug) return [[{ id: "10" }]];
      return [state.collision && values[0] === "new-title" ? [{ id: 11 }] : []];
    }
    if (sql.startsWith("UPDATE")) {
      assert.doesNotMatch(sql, /SET.*(?:status|view_count|created_by|published_at)/s);
      if (state.races > 0) { state.races--; throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" }); }
      state.writes++;
      [row.category_id, row.title, row.slug, row.content] = values;
      return [{ affectedRows: 1 }];
    }
    return [String(values[0]) === "10" ? [{ ...row }] : []];
  };
  return state;
}

const invalidBodies = [{}, [], { categoryId: "1" }, { categoryId: 0 }, { categoryId: null },
  { title: null }, { title: false }, { title: "ab" }, { title: " " }, { title: "a".repeat(201) },
  { content: " " }, { content: 1 }, { content: null },
  ...["id", "slug", "status", "viewCount", "createdBy", "publishedAt", "createdAt", "updatedAt"].map(key => ({ [key]: "bad" }))];

test("partial edits preserve lifecycle fields in every status and allocate slugs safely", async () => {
  const db = database();
  for (const id of [0, -1, 1.5, "abc", null, "18446744073709551616"]) {
    await assert.rejects(service.updateArticle(id, { content: "New" }, db), { statusCode: 422 });
  }
  for (const body of [...invalidBodies, { title: undefined }, { content: undefined }]) {
    await assert.rejects(service.updateArticle(10, body, db), { statusCode: 422 });
  }
  await assert.rejects(service.updateArticle(99, { content: "New" }, db), { statusCode: 404, message: "Knowledge Base article not found" });
  await assert.rejects(service.updateArticle(10, { categoryId: 99 }, db), { statusCode: 404 });
  await assert.rejects(service.updateArticle(10, { categoryId: 2 }, db), { statusCode: 409 });
  assert.equal(db.writes, 0);
  await service.updateArticle(10, { title: " VPN Setup " }, db);
  assert.equal(db.writes, 0);
  for (const status of ["DRAFT", "PUBLISHED", "ARCHIVED"]) {
    db.row.status = status;
    const article = await service.updateArticle(10, { content: ` ${status} content ` }, db);
    assert.equal(article.status, status);
    assert.equal(article.slug, "vpn-setup");
    assert.equal(article.title, "VPN Setup");
    assert.equal(article.categoryId, 1);
    assert.equal(article.createdBy, 7);
    assert.equal(article.viewCount, 17);
    assert.equal(article.publishedAt, "published");
  }
  assert.deepEqual(db.slugs, []);
  assert.equal((await service.updateArticle(10, { title: "VPN Setup!" }, db)).slug, "vpn-setup");
  db.collision = true;
  db.races = 1;
  assert.equal((await service.updateArticle(10, { title: "New Title" }, db)).slug, "new-title-3");
  assert.equal((await service.updateArticle(10, { categoryId: 3 }, db)).categoryId, 3);
  db.races = 5;
  await assert.rejects(service.updateArticle(10, { title: "Another title" }, db), { statusCode: 409 });
});

test("article PATCH authenticates ADMIN, validates inputs and returns mapped content edits", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "kb-edit-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "ADMIN", 2: "TECHNICIAN", 3: "EMPLOYEE" }[id], is_active: 1 }));
  const db = database();
  const query = t.mock.method(pool, "query", db.query);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/knowledge-base/articles`;
  const patch = (body, actor = 1, id = "10") => fetch(`${url}/${id}`, { method: "PATCH", headers: {
    "content-type": "application/json", ...(actor ? { authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}` } : {}),
  }, body: JSON.stringify(body) });
  assert.equal((await patch({ content: "New" }, null)).status, 401);
  for (const actor of [2, 3]) assert.equal((await patch({ content: "New", role: "ADMIN" }, actor)).status, 403);
  for (const body of invalidBodies) assert.equal((await patch(body)).status, 422);
  for (const id of ["0", "-1", "1.5", "abc"]) assert.equal((await patch({ content: "New" }, 1, id)).status, 422);
  assert.equal(query.mock.callCount(), 0);
  assert.equal((await patch({ content: "New" }, 1, "99")).status, 404);
  assert.equal((await patch({ categoryId: 2 })).status, 409);
  assert.equal((await patch({ categoryId: 99 })).status, 404);
  const response = await patch({ content: " Updated content only " });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, message: "Knowledge Base article updated successfully", data: {
    article: { id: 10, categoryId: 1, categoryName: "Network", title: "VPN Setup", slug: "vpn-setup", content: "Updated content only",
      status: "PUBLISHED", viewCount: 17, createdBy: 7, publishedAt: "published", createdAt: "created", updatedAt: "updated" },
  } });
  assert.equal(db.writes, 1);
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/knowledgeBase/knowledgeBaseArticle.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

function database() {
  const state = { writes: 0, category: { is_active: 1 }, categoryReads: 0,
    row: { id: 10, category_id: 1, category_name: "Network", title: "VPN Setup", slug: "vpn-setup", content: "Body",
      status: "DRAFT", view_count: 17, created_by: 7, published_at: null, created_at: "created", updated_at: "updated" } };
  state.query = async (sql, values) => {
    if (sql.includes("FROM knowledge_base_categories")) {
      state.categoryReads++;
      return [state.category ? [state.category] : []];
    }
    if (sql.startsWith("UPDATE")) {
      assert.equal(sql, "UPDATE knowledge_base_articles SET status = ?, published_at = ? WHERE id = ?");
      state.writes++;
      state.row.status = values[0];
      state.row.published_at = values[1];
      return [{ affectedRows: 1 }];
    }
    assert.match(sql, /WHERE a.id = \? LIMIT 1/);
    return [String(values[0]) === "10" ? [{ ...state.row }] : []];
  };
  return state;
}

test("publish/unpublish validates transitions, category availability, timestamps and no-ops", async () => {
  const db = database();
  for (const method of [service.publishArticle, service.unpublishArticle]) {
    for (const id of [0, -1, 1.5, "abc", null, undefined, true, "18446744073709551616"]) {
      await assert.rejects(method(id, db), { statusCode: 422 });
    }
    await assert.rejects(method(99, db), { statusCode: 404, message: "Knowledge Base article not found" });
    db.row.status = "ARCHIVED";
    await assert.rejects(method(10, db), { statusCode: 409 });
    db.row.status = "INVALID";
    await assert.rejects(method(10, db), { statusCode: 409 });
  }
  db.row.status = "DRAFT";
  db.category = null;
  await assert.rejects(service.publishArticle(10, db), { statusCode: 409 });
  db.category = { is_active: 0 };
  await assert.rejects(service.publishArticle(10, db), { statusCode: 409, message: "Knowledge Base category is inactive" });
  await service.unpublishArticle(10, db);
  assert.equal(db.writes, 0);
  db.category.is_active = 1;
  const before = Date.now();
  const published = await service.publishArticle("10", db);
  assert.ok(published.publishedAt instanceof Date);
  assert.ok(published.publishedAt.getTime() >= before && published.publishedAt.getTime() <= Date.now());
  db.category.is_active = 0;
  const reads = db.categoryReads;
  assert.deepEqual(await service.publishArticle(10, db), published);
  assert.equal(db.categoryReads, reads);
  assert.equal(db.writes, 1);
  const draft = await service.unpublishArticle(10, db);
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.publishedAt, null);
  assert.equal(draft.viewCount, 17);
  assert.equal(draft.createdBy, 7);
  assert.equal(draft.slug, "vpn-setup");
  assert.equal(draft.content, "Body");
  await service.unpublishArticle(10, db);
  assert.equal(db.writes, 2);
  db.category.is_active = 1;
  assert.equal((await service.publishArticle(10, db)).status, "PUBLISHED");
  assert.equal(db.writes, 3);
});

test("registered publish/unpublish routes require ADMIN and return mapped results", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "kb-publish-test"; });
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
  const base = `http://127.0.0.1:${server.address().port}/api/v1/knowledge-base/articles`;
  const patch = (action, actor = 1, id = "10") => fetch(`${base}/${id}/${action}`, { method: "PATCH", headers: {
    "content-type": "application/json", ...(actor ? { authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}` } : {}),
  }, body: JSON.stringify({ status: "ARCHIVED", viewCount: 0, createdBy: 1, publishedAt: "spoofed" }) });
  for (const action of ["publish", "unpublish"]) {
    assert.equal((await patch(action, null)).status, 401);
    for (const actor of [2, 3]) assert.equal((await patch(action, actor)).status, 403);
    for (const id of ["0", "-1", "1.5", "abc", "18446744073709551616"]) assert.equal((await patch(action, 1, id)).status, 422);
  }
  assert.equal(query.mock.callCount(), 0);
  for (const action of ["publish", "unpublish"]) {
    assert.equal((await patch(action, 1, "99")).status, 404);
    db.row.status = "ARCHIVED";
    assert.equal((await patch(action)).status, 409);
  }
  db.row.status = "DRAFT";
  db.category.is_active = 0;
  assert.equal((await patch("publish")).status, 409);
  db.category.is_active = 1;
  for (const action of ["publish", "publish", "unpublish", "unpublish"]) {
    const response = await patch(action);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.message, `Knowledge Base article ${action === "publish" ? "published" : "unpublished"} successfully`);
    assert.equal(result.success, true);
    assert.equal(result.data.article.status, action === "publish" ? "PUBLISHED" : "DRAFT");
    assert.equal(result.data.article.viewCount, 17);
    assert.equal(result.data.article.createdBy, 7);
    assert.equal("published_at" in result.data.article, false);
  }
  assert.equal(db.writes, 2);
});

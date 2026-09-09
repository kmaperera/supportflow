const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/knowledgeBase/knowledgeBaseArticle.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

function database(status = "DRAFT", publishedAt = null) {
  const state = { writes: 0, row: { id: 10, category_id: 1, category_name: "Network", title: "VPN Setup",
    slug: "vpn-setup", content: "Body", status, view_count: 17, created_by: 7,
    published_at: publishedAt, created_at: "created", updated_at: "original" } };
  state.query = async (sql, values) => {
    if (sql.startsWith("UPDATE")) {
      assert.equal(sql, "UPDATE knowledge_base_articles SET status = ?, published_at = ? WHERE id = ?");
      assert.deepEqual(values.slice(0, 2), ["ARCHIVED", null]);
      state.writes++;
      state.row.status = "ARCHIVED";
      state.row.published_at = null;
      state.row.updated_at = "updated";
      return [{ affectedRows: 1 }];
    }
    // Any feedback, deletion, category mutation or notification SQL fails this contract.
    assert.match(sql, /^\s*SELECT .*FROM knowledge_base_articles AS a.*WHERE a.id = \? LIMIT 1/s);
    return [String(values[0]) === "10" ? [{ ...state.row }] : []];
  };
  return state;
}

test("archive preserves content and history, clears publication and is idempotent", async () => {
  for (const status of ["DRAFT", "PUBLISHED", "ARCHIVED"]) {
    const db = database(status, status === "PUBLISHED" ? "published" : null);
    const original = { ...db.row };
    const result = await service.archiveArticle("10", db);
    assert.equal(result.status, "ARCHIVED");
    assert.equal(result.publishedAt, null);
    for (const key of ["category_id", "title", "slug", "content", "view_count", "created_by", "created_at"]) {
      assert.equal(db.row[key], original[key]);
    }
    assert.deepEqual(await service.archiveArticle(10, db), result);
    assert.equal(db.writes, status === "ARCHIVED" ? 0 : 1);
    await assert.rejects(service.publishArticle(10, db), { statusCode: 409 });
    await assert.rejects(service.unpublishArticle(10, db), { statusCode: 409 });
  }
  const inconsistent = database("ARCHIVED", "stale publication");
  assert.equal((await service.archiveArticle(10, inconsistent)).publishedAt, null);
  await service.archiveArticle(10, inconsistent);
  assert.equal(inconsistent.writes, 1);
  for (const id of [0, -1, 1.5, "abc", null, undefined, true, "18446744073709551616"]) {
    await assert.rejects(service.archiveArticle(id, { async query() { assert.fail("Invalid ID queried SQL"); } }), { statusCode: 422 });
  }
  await assert.rejects(service.archiveArticle(99, database()), { statusCode: 404, message: "Knowledge Base article not found" });
  await assert.rejects(service.archiveArticle(10, database("INVALID")), { statusCode: 409 });
  const failure = new Error("database failure");
  await assert.rejects(service.archiveArticle(10, { async query() { throw failure; } }), e => e === failure);
});

test("archive endpoint requires ADMIN, returns mapped data and exposes no deletion or restore", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "kb-archive-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "ADMIN", 2: "TECHNICIAN", 3: "EMPLOYEE" }[id], is_active: 1 }));
  const db = database("PUBLISHED", "published");
  const query = t.mock.method(pool, "query", db.query);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/knowledge-base/articles`;
  const headers = actor => ({ "content-type": "application/json", ...(actor ? {
    authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {}) });
  const archive = (actor = 1, id = "10") => fetch(`${base}/${id}/archive`, { method: "PATCH", headers: headers(actor),
    body: JSON.stringify({ role: "ADMIN", status: "PUBLISHED", slug: "changed", viewCount: 0 }) });
  assert.equal((await archive(null)).status, 401);
  for (const actor of [2, 3]) assert.equal((await archive(actor)).status, 403);
  for (const id of ["0", "-1", "1.5", "abc", "18446744073709551616"]) assert.equal((await archive(1, id)).status, 422);
  assert.equal(query.mock.callCount(), 0);
  assert.equal((await archive(1, "99")).status, 404);
  for (let i = 0; i < 2; i++) {
    const response = await archive();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, message: "Knowledge Base article archived successfully", data: {
      article: { id: 10, categoryId: 1, categoryName: "Network", title: "VPN Setup", slug: "vpn-setup", content: "Body",
        status: "ARCHIVED", viewCount: 17, createdBy: 7, publishedAt: null, createdAt: "created", updatedAt: "updated" },
    } });
  }
  assert.equal(db.writes, 1);
  for (const [method, suffix] of [["DELETE", ""], ["PATCH", "/restore"], ["PATCH", "/unarchive"]]) {
    assert.equal((await fetch(`${base}/10${suffix}`, { method, headers: headers(1) })).status, 404);
  }
});

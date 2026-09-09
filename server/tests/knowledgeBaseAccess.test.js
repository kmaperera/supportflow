const { test } = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");
const service = require("../src/modules/knowledgeBase/knowledgeBaseArticle.service");

test("all KB routes authenticate and management routes deny readers before database access", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "kb-access-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "ADMIN", 2: "TECHNICIAN", 3: "EMPLOYEE" }[id], is_active: 1 }));
  const query = t.mock.method(pool, "query", async () => { assert.fail("Denied request reached SQL"); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/knowledge-base`;
  const management = [["POST", "/categories"], ["PATCH", "/categories/1"], ["PATCH", "/categories/1/status"],
    ["POST", "/articles"], ["PATCH", "/articles/1"], ["PATCH", "/articles/1/publish"],
    ["PATCH", "/articles/1/unpublish"], ["PATCH", "/articles/1/archive"]];
  const reader = [["GET", "/articles"], ["GET", "/articles/1"], ["GET", "/articles/1/feedback"],
    ["PUT", "/articles/1/feedback"], ["POST", "/articles/suggestions"]];
  const request = (method, path, actor) => fetch(base + path, { method, headers: {
    "content-type": "application/json", ...(actor ? { authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}` } : {}),
  }, ...(method === "GET" ? {} : { body: JSON.stringify({ role: "ADMIN", userId: 1, isHelpful: true }) }) });
  for (const [method, path] of [...management, ...reader]) assert.equal((await request(method, path)).status, 401);
  for (const [method, path] of management) for (const actor of [2, 3]) assert.equal((await request(method, path, actor)).status, 403);
  assert.equal(query.mock.callCount(), 0);
});

test("article content is not returned if visibility changes during the counter refresh", async () => {
  let reads = 0;
  await assert.rejects(service.getArticleById(10, { role: "EMPLOYEE" }, { async query(sql) {
    if (sql.startsWith("UPDATE")) return [{ affectedRows: 1 }];
    reads++;
    return [[{ id: 10, status: reads === 1 ? "PUBLISHED" : "ARCHIVED", category_is_active: 1 }]];
  } }), { statusCode: 404, message: "Knowledge Base article not found" });
});

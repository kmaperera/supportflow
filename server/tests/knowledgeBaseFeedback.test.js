const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/knowledgeBase/articleFeedback.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

function database() {
  const state = { status: "PUBLISHED", active: 1, votes: new Map(), writes: 0, race: false };
  state.query = async (sql, values) => {
    assert.doesNotMatch(sql, /UPDATE knowledge_base_articles|DELETE|notifications/);
    if (sql.includes("FROM knowledge_base_articles")) return [String(values[0]) === "10" ? [{ id: 10, status: state.status, category_is_active: state.active }] : []];
    if (sql.includes("INSERT")) {
      const key = String(values[1]);
      if (state.race) { state.votes.set(key, !values[2]); state.race = false; throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" }); }
      assert.ok(!state.votes.has(key));
      state.votes.set(key, values[2]); state.writes++;
      return [{ insertId: 1 }];
    }
    if (sql.startsWith("UPDATE")) {
      assert.match(sql, /WHERE article_id = \? AND user_id = \?/);
      state.votes.set(String(values[2]), values[0]); state.writes++;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("COUNT")) {
      const votes = [...state.votes.values()];
      return [[{ helpful_count: String(votes.filter(Boolean).length), not_helpful_count: String(votes.filter(v => !v).length), total_feedback: String(votes.length) }]];
    }
    assert.match(sql, /WHERE article_id = \? AND user_id = \?/);
    return [state.votes.has(String(values[1])) ? [{ is_helpful: state.votes.get(String(values[1])) }] : []];
  };
  return state;
}

test("feedback validates, changes votes idempotently and handles duplicate races without article writes", async () => {
  const db = database();
  const values = { articleId: 10, userId: 2, userRole: "EMPLOYEE" };
  const noQuery = { async query() { assert.fail("Unexpected SQL"); } };
  for (const isHelpful of ["true", "false", 0, 1, null, undefined]) await assert.rejects(service.setArticleFeedback({ ...values, isHelpful }, noQuery), { statusCode: 422 });
  for (const articleId of [0, -1, 1.5, "abc", null]) await assert.rejects(service.getArticleFeedback({ ...values, articleId }, noQuery), { statusCode: 422 });
  await assert.rejects(service.setArticleFeedback({ ...values, userRole: "ADMIN", isHelpful: true }, noQuery), { statusCode: 403 });
  assert.equal((await service.getArticleFeedback(values, db)).feedback, null);
  for (const vote of [true, true, false, false, true]) await service.setArticleFeedback({ ...values, isHelpful: vote }, db);
  assert.equal(db.writes, 3);
  assert.equal(db.votes.size, 1);
  assert.deepEqual(await service.getArticleFeedback(values, db), { feedback: { isHelpful: true }, summary: { helpfulCount: 1, notHelpfulCount: 0, totalFeedback: 1 } });
  db.race = true;
  await service.setArticleFeedback({ ...values, userId: 3, isHelpful: false }, db);
  assert.equal(db.votes.get("3"), false);
  assert.equal(db.votes.size, 2);
  for (const status of ["DRAFT", "PUBLISHED", "ARCHIVED"]) for (const active of [0, 1]) {
    db.status = status; db.active = active;
    assert.equal((await service.getArticleFeedback({ ...values, userRole: "ADMIN" }, db)).feedback, null);
    if (status !== "PUBLISHED" || !active) for (const userRole of ["EMPLOYEE", "TECHNICIAN"]) {
      await assert.rejects(service.getArticleFeedback({ ...values, userRole }, db), { statusCode: 404 });
      await assert.rejects(service.setArticleFeedback({ ...values, userRole, isHelpful: true }, db), { statusCode: 404 });
    }
  }
  await assert.rejects(service.getArticleFeedback({ ...values, articleId: 99 }, db), { statusCode: 404 });
});

test("feedback routes authenticate, reject spoofed identity and return reader votes and admin summaries", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "kb-feedback-test"; });
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
  const request = (method, actor, body, id = "10") => fetch(`${base}/${id}/feedback`, { method, headers: {
    "content-type": "application/json", ...(actor ? { authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}` } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  for (const method of ["GET", "PUT"]) assert.equal((await request(method, null)).status, 401);
  assert.equal((await request("PUT", 1, { isHelpful: true })).status, 403);
  for (const body of [{}, { isHelpful: "true" }, { isHelpful: 1 }, { isHelpful: null }, { isHelpful: true, userId: 9 }, { isHelpful: true, role: "EMPLOYEE" }]) {
    assert.equal((await request("PUT", 2, body)).status, 422);
  }
  assert.equal((await request("GET", 2, undefined, "0")).status, 422);
  assert.equal((await request("GET", 2, undefined, "99")).status, 404);
  for (const actor of [2, 3]) {
    assert.equal((await request("PUT", actor, { isHelpful: true })).status, 200);
    assert.equal((await request("PUT", actor, { isHelpful: true })).status, 200);
    const response = await request("GET", actor);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.feedback, { isHelpful: true });
  }
  assert.equal(db.writes, 2);
  await request("PUT", 2, { isHelpful: false });
  const admin = await request("GET", 1);
  assert.deepEqual((await admin.json()).data, { feedback: null, summary: { helpfulCount: 1, notHelpfulCount: 1, totalFeedback: 2 } });
  db.active = 0;
  assert.equal((await request("GET", 2)).status, 404);
  assert.equal((await request("PUT", 3, { isHelpful: false })).status, 404);
  assert.equal((await request("DELETE", 2)).status, 404);
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/knowledgeBase/knowledgeBaseArticle.service");
const repository = require("../src/modules/knowledgeBase/knowledgeBaseArticle.repository");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

test("suggestions validate and bound unique keywords and return lightweight summaries", async () => {
  const noQuery = { async query() { assert.fail("Unexpected SQL"); } };
  for (const values of [{}, null, [], { title: " " }, { title: 3 }, { description: null }, { title: "x".repeat(201) }, { title: "VPN", limit: 10 }]) {
    await assert.rejects(service.getSuggestedArticles(values, noQuery), { statusCode: 422 });
  }
  assert.deepEqual(await service.getSuggestedArticles({ title: "the a to !!!" }, noQuery), []);
  let calls = 0;
  const result = await service.getSuggestedArticles({ title: " Network NETWORK and Password ", description: "one two three four five six seven eight nine" }, {
    async query(sql, values) {
      calls++;
      assert.deepEqual(values, ["network", "password", "one", "two", "three", "four", "five", "six"].flatMap(term => [`%${term}%`, `%${term}%`]).concat(5));
      assert.match(sql, /WHERE a.status = 'PUBLISHED' AND c.is_active = TRUE/);
      assert.match(sql, /a.title LIKE \? THEN 3/);
      assert.match(sql, /a.content LIKE \? THEN 1/);
      assert.match(sql, /HAVING relevance_score > 0/);
      assert.match(sql, /ORDER BY relevance_score DESC, a.view_count DESC, a.published_at DESC, a.id DESC LIMIT \?/);
      assert.doesNotMatch(sql, /INSERT|UPDATE|DELETE|tickets|article_feedback/);
      return [[{ id: 1, category_id: 2, category_name: "Network", title: "Guide", slug: "guide", view_count: 8, published_at: "published", relevance_score: 4, content: "hidden" }]];
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, [{ id: 1, categoryId: 2, categoryName: "Network", title: "Guide", slug: "guide", viewCount: 8, publishedAt: "published" }]);
  await repository.findSuggestedArticles({ terms: ["x' OR 1=1 --"], limit: 5 }, { async query(sql, values) {
    assert.ok(!sql.includes("x' OR 1=1 --"));
    assert.deepEqual(values, ["%x' OR 1=1 --%", "%x' OR 1=1 --%", 5]);
    return [[]];
  } });
  await assert.rejects(repository.findSuggestedArticles({ terms: Array(9).fill("word") }, noQuery), TypeError);
});

test("suggestions endpoint authenticates all roles with reader-only SQL and no writes", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "kb-suggestions-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "ADMIN", 2: "TECHNICIAN", 3: "EMPLOYEE" }[id], is_active: 1 }));
  const query = t.mock.method(pool, "query", async (sql, values) => {
    assert.match(sql, /^SELECT /);
    assert.match(sql, /WHERE a.status = 'PUBLISHED' AND c.is_active = TRUE/);
    assert.equal(values.at(-1), 5);
    return [[]];
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/knowledge-base/articles/suggestions`;
  const post = (actor, body) => fetch(url, { method: "POST", headers: {
    "content-type": "application/json", ...(actor ? { authorization: `Bearer ${jwt.sign({}, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}` } : {}),
  }, body: JSON.stringify(body) });
  assert.equal((await post(null, { title: "Network" })).status, 401);
  for (const body of [{}, { title: " " }, { title: false }, { description: [] }, { title: "x".repeat(201) }]) assert.equal((await post(1, body)).status, 422);
  assert.equal(query.mock.callCount(), 0);
  for (const actor of [1, 2, 3]) {
    const response = await post(actor, { description: "Network disconnects" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, message: "Knowledge Base article suggestions retrieved successfully", data: { articles: [] } });
  }
  assert.equal(query.mock.callCount(), 3);
});

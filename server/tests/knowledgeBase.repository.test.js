const { test } = require("node:test");
const assert = require("node:assert/strict");
const categories = require("../src/modules/knowledgeBase/knowledgeBaseCategory.repository");
const articles = require("../src/modules/knowledgeBase/knowledgeBaseArticle.repository");
const feedback = require("../src/modules/knowledgeBase/articleFeedback.repository");

const input = "name' OR 1=1 --";
const cases = [
  [categories.findAll, [], [], "list"],
  [categories.findById, [7], [7], "single"],
  [categories.findByName, [input], [input], "single"],
  [categories.create, [{ name: input }], [input, null], "insert"],
  [categories.updateById, [7, { name: input, description: null, isActive: false }], [input, null, 7], "update"],
  [categories.setActiveStatus, [7, false], [false, 7], "update"],
  [categories.findActive, [], [], "list"],
  [articles.findById, [25], [25], "single"],
  [articles.findBySlug, [input], [input], "single"],
  [articles.create, [{ categoryId: 7, title: input, slug: input, content: input, createdBy: 3, status: "PUBLISHED" }], [7, input, input, input, 3], "insert"],
  [articles.updateById, [25, { categoryId: 7, title: input, slug: input, content: input, status: "ARCHIVED", viewCount: 99 }], [7, input, input, input, 25], "update"],
  [articles.updateStatus, [25, "DRAFT", null], ["DRAFT", null, 25], "update"],
  [articles.findAll, [undefined], [20, 0], "list"],
  [articles.findAll, [{ limit: 5, offset: 10 }], [5, 10], "list"],
  [articles.findByStatus, ["ARCHIVED"], ["ARCHIVED"], "list"],
  [articles.findByCategoryId, [7], [7], "list"],
  [articles.incrementViewCount, [25], [25], "update"],
  [feedback.findByArticleAndUser, [25, 3], [25, 3], "single"],
  [feedback.create, [{ articleId: 25, userId: 3, isHelpful: false }], [25, 3, false], "insert"],
  [feedback.updateByArticleAndUser, [25, 3, true], [true, 25, 3], "update"],
  [feedback.getSummaryByArticleId, [25], [25], "summary"],
];

test("all methods use the injected connection, bind values and preserve return shapes", async () => {
  for (const [method, args, expectedValues, shape] of cases) {
    const row = { id: 25, category_id: 7, is_helpful: 0 };
    const summary = { helpful_count: 0, not_helpful_count: 0, total_feedback: 0 };
    const rows = [shape === "summary" ? summary : row];
    let calls = 0;
    const db = { async query(sql, values = []) {
      calls++;
      assert.deepEqual(values, expectedValues, method.name);
      assert.equal((sql.match(/\?/g) || []).length, values.length);
      assert.ok(!sql.includes(input));
      return [shape === "insert" ? { insertId: 42 } : shape === "update" ? { affectedRows: 1 } : rows];
    } };
    const result = await method(...args, db);
    assert.equal(calls, 1);
    assert.strictEqual(result, shape === "insert" ? 42 : shape === "update" ? 1 : shape === "list" ? rows : rows[0]);
    const failure = Object.assign(new Error("database failure"), { code: "ER_DUP_ENTRY" });
    await assert.rejects(method(...args, { async query() { throw failure; } }), err => err === failure);
    if (shape === "single" || shape === "list" || shape === "update") {
      const emptyDb = { async query() { return [shape === "update" ? { affectedRows: 0 } : []]; } };
      assert.deepEqual(await method(...args, emptyDb), shape === "single" ? null : shape === "list" ? [] : 0);
    }
  }
});

test("writes preserve database defaults and keep content edits separate from lifecycle fields", async () => {
  async function capture(method, args) {
    let statement;
    await method(...args, { async query(sql) { statement = sql; return [{ insertId: 1, affectedRows: 1 }]; } });
    return statement;
  }
  const categoryCreate = await capture(categories.create, [{ name: "Network" }]);
  assert.doesNotMatch(categoryCreate, /is_active|created_at|updated_at/);
  const categoryEdit = await capture(categories.updateById, [7, { name: "Network" }]);
  assert.doesNotMatch(categoryEdit, /is_active/);
  const articleCreate = await capture(articles.create, [{ categoryId: 7, title: "Title", slug: "title", content: "Body", createdBy: 3 }]);
  assert.doesNotMatch(articleCreate, /status|view_count|published_at|created_at|updated_at/);
  const articleEdit = await capture(articles.updateById, [25, { categoryId: 7, title: "Title", slug: "title", content: "Body" }]);
  assert.doesNotMatch(articleEdit, /status|view_count|created_by|published_at/);
  assert.match(await capture(articles.incrementViewCount, [25]), /SET view_count = view_count \+ 1 WHERE id = \?/);
});

test("lookups retain visibility and use actual category and author fields", async () => {
  const db = { async query(sql) {
    assert.match(sql, /c.name AS category_name/);
    assert.match(sql, /author.first_name AS author_first_name/);
    assert.match(sql, /author.last_name AS author_last_name/);
    assert.match(sql, /c.is_active AS category_is_active/);
    assert.doesNotMatch(sql, /WHERE.*is_active|PUBLISHED|full_name|display_name/);
    return [[]];
  } };
  await articles.findById(25, db);
  await articles.findBySlug("title", db);
  await categories.findAll({ async query(sql) {
    assert.doesNotMatch(sql, /WHERE/);
    assert.match(sql, /ORDER BY name ASC/);
    return [[]];
  } });
  await categories.findActive({ async query(sql) {
    assert.match(sql, /WHERE is_active = TRUE ORDER BY name ASC/);
    return [[]];
  } });
});

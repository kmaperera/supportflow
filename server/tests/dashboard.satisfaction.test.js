const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/dashboard/dashboard.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

function database(ratings = [5, 4, 1]) {
  return { ratings, async query(sql) {
    assert.match(sql, /COUNT\(\*\) AS total_ratings, AVG\(rating\) AS average_rating/);
    assert.match(sql, /COALESCE\(SUM\(rating >= 4\), 0\) AS satisfied_ratings/);
    assert.match(sql, /FROM ticket_feedback$/);
    assert.doesNotMatch(sql, /JOIN|WHERE|article_feedback|users|tickets|UPDATE|INSERT|DELETE/);
    const row = { total_ratings: String(ratings.length), average_rating: ratings.length ? String(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null,
      satisfied_ratings: String(ratings.filter(rating => rating >= 4).length) };
    for (const rating of [5, 4, 3, 2, 1]) {
      assert.ok(sql.includes(`COALESCE(SUM(rating = ${rating}), 0) AS rating_${rating}`));
      row[`rating_${rating}`] = String(ratings.filter(value => value === rating).length);
    }
    return [[row]];
  } };
}
const distribution = counts => [5, 4, 3, 2, 1].map((rating, i) => ({ rating, count: counts[i] }));

test("satisfaction aggregates current persisted ratings and normalizes numbers", async () => {
  const db = database();
  const before = await service.getSatisfactionSummary(db);
  assert.deepEqual(before, { totalRatings: 3, averageRating: 3.33, satisfiedRatings: 2, satisfactionPercentage: 66.67,
    ratingDistribution: distribution([1, 1, 0, 0, 1]) });
  db.ratings[0] = 3;
  const after = await service.getSatisfactionSummary(db);
  assert.deepEqual(after, { totalRatings: 3, averageRating: 2.67, satisfiedRatings: 1, satisfactionPercentage: 33.33,
    ratingDistribution: distribution([0, 1, 1, 0, 1]) });
  for (const result of [before, after]) {
    assert.equal(result.ratingDistribution.reduce((sum, row) => sum + row.count, 0), result.totalRatings);
    assert.equal(result.satisfiedRatings, result.ratingDistribution[0].count + result.ratingDistribution[1].count);
  }
});

test("satisfaction distinguishes no sample from measured zero satisfaction", async () => {
  assert.deepEqual(await service.getSatisfactionSummary(database([])), { totalRatings: 0, averageRating: null,
    satisfiedRatings: 0, satisfactionPercentage: null, ratingDistribution: distribution([0, 0, 0, 0, 0]) });
  assert.deepEqual(await service.getSatisfactionSummary(database([1, 2, 3])), { totalRatings: 3, averageRating: 2,
    satisfiedRatings: 0, satisfactionPercentage: 0, ratingDistribution: distribution([0, 0, 1, 1, 1]) });
  assert.equal((await service.getSatisfactionSummary(database([4, 5]))).satisfactionPercentage, 100);
});

test("satisfaction endpoint authenticates, rejects overrides and follows current assignment", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "satisfaction-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  const roles = { 1: "EMPLOYEE", 2: "TECHNICIAN", 3: "ADMIN", 4: "OTHER", 6: "TECHNICIAN" };
  t.mock.method(users, "findById", async id => ({ id, role: roles[id], is_active: 1 }));
  const db = database();
  const query = t.mock.method(pool, "query", db.query);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/dashboard/satisfaction-summary`;
  const get = (actor, suffix = "") => fetch(url + suffix, { headers: actor ? {
    authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {} });
  assert.equal((await get(null)).status, 401);
  for (const actor of [1, 2, 4]) assert.equal((await get(actor)).status, 403);
  for (const key of ["userId", "employeeId", "technicianId", "role", "dateFrom", "dateTo", "month", "year"]) {
    assert.equal((await get(3, `?${key}=3`)).status, 422);
  }
  assert.equal(query.mock.callCount(), 0);
  const response = await get(3);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, message: "Satisfaction summary retrieved successfully", data: { summary: {
    totalRatings: 3, averageRating: 3.33, satisfiedRatings: 2, satisfactionPercentage: 66.67, ratingDistribution: distribution([1, 1, 0, 0, 1]) } } });
  assert.equal(query.mock.callCount(), 1);
  db.ratings.length = 0;
  const empty = await get(3);
  assert.equal(empty.status, 200);
  assert.equal((await empty.json()).data.summary.averageRating, null);
});

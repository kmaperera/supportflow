const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
// App startup validates upload configuration; this test never calls uploads.
const cloudinaryVariables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
const savedCloudinary = cloudinaryVariables.map(name => process.env[name]);
for (const name of cloudinaryVariables) process.env[name] = "sla-list-test";
const app = require("../src/app");
cloudinaryVariables.forEach((name, index) => {
  if (savedCloudinary[index] === undefined) delete process.env[name];
  else process.env[name] = savedCloudinary[index];
});

test("SLA listing authenticates, requires the database ADMIN role, and returns mapped policies read-only", async (t) => {
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = "sla-list-api-test-secret";
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previousSecret;
  });
  const roles = { 1: "ADMIN", 2: "EMPLOYEE", 3: "TECHNICIAN" };
  const lookup = t.mock.method(users, "findById", async id => ({ id, role: roles[id], is_active: 1 }));
  let rows = ["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((name, index) => ({
    id: 10 - index, priority_id: 90 - index, priority_name: name,
    response_time_minutes: 15 * (index + 1), resolution_time_minutes: 120 * (index + 1),
    is_active: index === 3 ? 0 : 1, created_at: "created", updated_at: "updated",
    internal_metadata: "must not be exposed",
  }));
  const query = t.mock.method(pool, "query", async sql => {
    assert.match(sql, /^\s*SELECT /);
    assert.match(sql, /ORDER BY sp\.response_time_minutes ASC, sp\.id ASC/);
    return [rows];
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/sla/policies`;
  // Even a signed ADMIN claim must not override the current database role.
  const headers = id => ({ authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(id), expiresIn: "5m" })}` });

  const anonymous = await fetch(`${url}?role=ADMIN`);
  assert.equal(anonymous.status, 401);
  assert.deepEqual(await anonymous.json(), { success: false, message: "Authentication required", errors: [] });
  assert.equal(lookup.mock.callCount(), 0);
  for (const id of [2, 3]) {
    const denied = await fetch(`${url}?role=ADMIN`, { headers: headers(id) });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).success, false);
  }
  assert.equal(query.mock.callCount(), 0);

  const response = await fetch(`${url}?priorityId=1&activeOnly=true&sort=desc&page=2`, { headers: headers(1) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true, message: "SLA policies retrieved successfully",
    data: { policies: rows.map(row => ({
      id: row.id, priorityId: row.priority_id, priorityName: row.priority_name,
      responseTimeMinutes: row.response_time_minutes, resolutionTimeMinutes: row.resolution_time_minutes,
      isActive: Boolean(row.is_active), createdAt: row.created_at, updatedAt: row.updated_at,
    })) },
  });
  rows = [];
  const empty = await fetch(url, { headers: headers(1) });
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()).data, { policies: [] });
  const reads = query.mock.callCount();
  for (const [method, suffix] of [["POST", ""], ["PATCH", "/1"], ["PUT", "/1"], ["DELETE", "/1"], ["PATCH", "/1/status"]]) {
    assert.equal((await fetch(url + suffix, { method, headers: headers(1) })).status, 404);
  }
  assert.equal(query.mock.callCount(), reads);
});

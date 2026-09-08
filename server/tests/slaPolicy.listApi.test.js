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
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-01-01T10:00:00Z") });
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
  for (const [method, suffix] of [["POST", ""], ["PUT", "/1"], ["DELETE", "/1"], ["PATCH", "/1/status"]]) {
    assert.equal((await fetch(url + suffix, { method, headers: headers(1) })).status, 404);
  }
  assert.equal(query.mock.callCount(), reads);
});

test("SLA updates validate before SQL and update only durations, with refreshed GET output", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-01-01T10:00:00Z") });
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = "sla-update-api-test-secret";
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previousSecret;
  });
  const roles = { 1: "ADMIN", 2: "EMPLOYEE", 3: "TECHNICIAN" };
  t.mock.method(users, "findById", async id => ({ id, role: roles[id], is_active: 1 }));
  const row = { id: 8, priority_id: 91, priority_name: "CRITICAL", response_time_minutes: 15,
    resolution_time_minutes: 120, is_active: 1, created_at: "created", updated_at: "original" };
  const query = t.mock.method(pool, "query", async (sql, values) => {
    if (sql.startsWith("UPDATE")) {
      assert.equal(sql, "UPDATE sla_policies SET response_time_minutes = ?, resolution_time_minutes = ? WHERE id = ?");
      assert.deepEqual(values, [45, 360, "8"]);
      row.response_time_minutes = values[0];
      row.resolution_time_minutes = values[1];
      row.updated_at = "updated";
      return [{ affectedRows: 1 }];
    }
    assert.match(sql, /FROM sla_policies AS sp/);
    if (sql.includes("WHERE")) {
      assert.match(sql, /WHERE sp.id = \? LIMIT 1/);
      return [values[0] === "8" ? [{ ...row }] : []];
    }
    return [[{ ...row }]];
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/sla/policies`;
  const headers = id => ({ "content-type": "application/json", ...(id ? {
    authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(id), expiresIn: "5m" })}`,
  } : {}) });
  const valid = { responseTimeMinutes: 45, resolutionTimeMinutes: 360 };
  const patch = (id, body = valid, actor = 1) => fetch(`${url}/${id}?role=ADMIN`, {
    method: "PATCH", headers: headers(actor), body: JSON.stringify(body),
  });
  assert.equal((await patch("8", valid, null)).status, 401);
  for (const actor of [2, 3]) {
    assert.equal((await patch("8", { ...valid, role: "ADMIN" }, actor)).status, 403);
  }
  for (const id of ["0", "-1", "1.5", "abc", "18446744073709551616"]) {
    assert.equal((await patch(id)).status, 422);
  }
  assert.equal((await patch("")).status, 404);
  for (const field of Object.keys(valid)) {
    for (const value of [0, -1, 1.5, "45", "NaN", null, undefined, true, 4294967296]) {
      assert.equal((await patch("8", { ...valid, [field]: value })).status, 422);
    }
  }
  for (const field of ["priorityId", "priorityName", "isActive", "createdAt", "updatedAt", "id", "unknown"]) {
    assert.equal((await patch("8", { ...valid, [field]: 1 })).status, 422);
  }
  for (const body of [{}, [], { responseTimeMinutes: 500, resolutionTimeMinutes: 300 }]) {
    assert.equal((await patch("8", body)).status, 422);
  }
  assert.equal(query.mock.callCount(), 0);
  const missing = await patch("999");
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).message, "SLA policy not found");
  const updated = await patch("8");
  assert.equal(updated.status, 200);
  const expected = { id: 8, priorityId: 91, priorityName: "CRITICAL", ...valid,
    isActive: true, createdAt: "created", updatedAt: "updated" };
  assert.deepEqual(await updated.json(), {
    success: true, message: "SLA policy updated successfully", data: { policy: expected },
  });
  const listing = await fetch(url, { headers: headers(1) });
  assert.equal(listing.status, 200);
  assert.deepEqual((await listing.json()).data, { policies: [expected] });
  assert.equal(query.mock.calls.filter(call => call.arguments[0].startsWith("UPDATE")).length, 1);
});

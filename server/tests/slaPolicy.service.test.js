const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/sla/slaPolicy.service");

test("reads map policies, normalize names and preserve injected database", async () => {
  let row = { id: 1, priority_id: 9, priority_name: "HIGH", response_time_minutes: 60,
    resolution_time_minutes: 480, is_active: 1, created_at: "created", updated_at: "updated" };
  let last;
  const db = { async query(sql, values) { last = values; return [row ? [row] : []]; } };
  const expected = { id: 1, priorityId: 9, priorityName: "HIGH", responseTimeMinutes: 60,
    resolutionTimeMinutes: 480, isActive: true, createdAt: "created", updatedAt: "updated" };
  assert.equal(service.mapSlaPolicy(null), null);
  assert.deepEqual(await service.getAllPolicies(db), [expected]);
  assert.deepEqual(await service.getPolicyById(1, db), expected);
  assert.deepEqual(await service.getPolicyByPriorityId(9, db), expected);
  assert.deepEqual(await service.getPolicyByPriorityName(" high ", db), expected);
  assert.deepEqual(last, ["HIGH"]);
  assert.deepEqual(await service.getActivePolicyByPriorityId(9, db), expected);
  row.is_active = 0;
  assert.equal((await service.getAllPolicies(db))[0].isActive, false);
  await assert.rejects(service.getActivePolicyByPriorityId(9, db), { statusCode: 409 });
  row = null;
  assert.deepEqual(await service.getAllPolicies(db), []);
  for (const [method, value] of [["getPolicyById", 1], ["getPolicyByPriorityId", 9], ["getPolicyByPriorityName", "HIGH"]]) {
    await assert.rejects(service[method](value, db), { statusCode: 404, message: "SLA policy not found" });
  }
});

test("updates preserve priority relationship and return refreshed mapped values", async () => {
  const row = { id: 1, priority_id: 9, response_time_minutes: 60, resolution_time_minutes: 480, is_active: 1 };
  const db = { async query(sql, values) {
    if (sql.startsWith("UPDATE")) {
      if (sql.includes("response_time_minutes")) {
        assert.deepEqual(values, [30, 30, 1]);
        row.response_time_minutes = values[0]; row.resolution_time_minutes = values[1];
      } else { assert.deepEqual(values, [false, 1]); row.is_active = 0; }
      return [{ affectedRows: 1 }];
    }
    return [[{ ...row }]];
  } };
  const updated = await service.updatePolicy(1, { responseTimeMinutes: 30, resolutionTimeMinutes: 30 }, db);
  assert.equal(updated.responseTimeMinutes, 30);
  assert.equal(updated.priorityId, 9);
  assert.equal((await service.setPolicyActiveStatus(1, false, db)).isActive, false);
});

test("invalid IDs, durations, immutable fields and non-booleans never query", async () => {
  let queries = 0;
  const db = { async query() { queries++; return [[]]; } };
  for (const id of [0, -1, 1.5, NaN, Infinity, "abc", "18446744073709551616"]) {
    await assert.rejects(service.getPolicyById(id, db), { statusCode: 422 });
  }
  for (const value of [0, -1, 1.5, "60", NaN, Infinity, 4294967296]) {
    await assert.rejects(service.updatePolicy(1, { responseTimeMinutes: value, resolutionTimeMinutes: 480 }, db), { statusCode: 422 });
    await assert.rejects(service.updatePolicy(1, { responseTimeMinutes: 30, resolutionTimeMinutes: value }, db), { statusCode: 422 });
  }
  for (const value of ["false", "true", 0, 1, null]) {
    await assert.rejects(service.setPolicyActiveStatus(1, value, db), { statusCode: 422 });
  }
  for (const values of [null, {}, { responseTimeMinutes: 60, resolutionTimeMinutes: 30 },
    { responseTimeMinutes: 30, resolutionTimeMinutes: 60, priorityId: 8 }]) {
    await assert.rejects(service.updatePolicy(1, values, db), { statusCode: 422 });
  }
  await assert.rejects(service.getPolicyByPriorityName(" ", db), { statusCode: 422 });
  assert.equal(queries, 0);
  await assert.rejects(service.updatePolicy(1, { responseTimeMinutes: 30, resolutionTimeMinutes: 60 }, db), { statusCode: 404 });
  assert.equal(queries, 1);
});

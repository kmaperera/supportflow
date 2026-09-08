const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/sla/slaCalculation.service");
const policies = require("../src/modules/sla/slaPolicy.service");

test("response deadlines use elapsed minutes without mutating input", () => {
  for (const [instant, minutes, expected] of [
    ["2026-12-31T23:45:00.123Z", 30, "2027-01-01T00:15:00.123Z"],
    ["2028-02-28T23:00:00Z", 1440, "2028-02-29T23:00:00.000Z"],
    ["2026-09-11T23:00:00Z", 2880, "2026-09-13T23:00:00.000Z"],
    ["2026-09-08T12:00:00+05:30", 60, "2026-09-08T07:30:00.000Z"],
  ]) {
    const startAt = new Date(instant);
    const original = startAt.getTime();
    const deadline = service.calculateResponseDeadline({ startAt, responseTimeMinutes: minutes });
    assert.equal(deadline.toISOString(), expected);
    assert.equal(startAt.getTime(), original);
    assert.notEqual(deadline, startAt);
  }
});

test("invalid inputs and arithmetic/date overflow are rejected", () => {
  for (const startAt of [null, undefined, new Date(NaN), "2026-01-01", 0, {}]) {
    assert.throws(() => service.calculateResponseDeadline({ startAt, responseTimeMinutes: 1 }), TypeError);
  }
  for (const responseTimeMinutes of [0, -1, 1.5, "30", NaN, Infinity, null, undefined]) {
    assert.throws(() => service.calculateResponseDeadline({ startAt: new Date(0), responseTimeMinutes }), TypeError);
  }
  assert.throws(() => service.calculateResponseDeadline({ startAt: new Date(8640000000000000), responseTimeMinutes: 1 }), RangeError);
  assert.throws(() => service.calculateResponseDeadline({ startAt: new Date(0), responseTimeMinutes: Number.MAX_SAFE_INTEGER }), RangeError);
});

test("policy helper forwards connection, returns policy and propagates lookup errors", async (t) => {
  const startAt = new Date("2026-01-01T00:00:00Z");
  const policy = { id: 1, responseTimeMinutes: 45 };
  const db = {};
  const lookup = t.mock.method(policies, "resolvePolicyForPriority", async (id, connection) => {
    assert.equal(id, 87); assert.equal(connection, db);
    startAt.setTime(0);
    return policy;
  });
  const result = await service.calculateResponseDeadlineForPriority({ startAt, priorityId: 87, db });
  assert.equal(result.policy, policy);
  assert.equal(result.responseDueAt.toISOString(), "2026-01-01T00:45:00.000Z");
  const failure = new Error("Policy unavailable");
  lookup.mock.mockImplementation(async () => { throw failure; });
  await assert.rejects(service.calculateResponseDeadlineForPriority({ startAt, priorityId: 87, db }), err => err === failure);
});

test("resolution deadlines preserve instants across calendar boundaries and offsets", () => {
  for (const [instant, minutes, expected] of [
    ["2026-12-31T23:45:00.123Z", 240, "2027-01-01T03:45:00.123Z"],
    ["2028-02-28T23:00:00Z", 1440, "2028-02-29T23:00:00.000Z"],
    ["2026-09-11T23:00:00Z", 2880, "2026-09-13T23:00:00.000Z"],
    ["2026-09-08T12:00:00+05:30", 480, "2026-09-08T14:30:00.000Z"],
  ]) {
    const startAt = new Date(instant);
    const original = startAt.getTime();
    const deadline = service.calculateResolutionDeadline({ startAt, resolutionTimeMinutes: minutes });
    assert.equal(deadline.toISOString(), expected);
    assert.equal(startAt.getTime(), original);
    assert.notEqual(deadline, startAt);
  }
});

test("resolution deadlines reject invalid inputs and overflow", () => {
  for (const startAt of [null, undefined, new Date(NaN), "2026-01-01", 0, {}]) {
    assert.throws(() => service.calculateResolutionDeadline({ startAt, resolutionTimeMinutes: 1 }), TypeError);
  }
  for (const resolutionTimeMinutes of [0, -1, 1.5, "30", NaN, Infinity, null, undefined]) {
    assert.throws(() => service.calculateResolutionDeadline({ startAt: new Date(0), resolutionTimeMinutes }), TypeError);
  }
  assert.throws(() => service.calculateResolutionDeadline({ startAt: new Date(8640000000000000), resolutionTimeMinutes: 1 }), RangeError);
  assert.throws(() => service.calculateResolutionDeadline({ startAt: new Date(0), resolutionTimeMinutes: Number.MAX_SAFE_INTEGER }), RangeError);
});

test("resolution policy helper forwards db, snapshots start and propagates failures", async (t) => {
  const startAt = new Date("2026-01-01T00:00:00Z");
  const policy = { id: 1, responseTimeMinutes: 30, resolutionTimeMinutes: 240 };
  const db = {};
  const lookup = t.mock.method(policies, "resolvePolicyForPriority", async (id, connection) => {
    assert.equal(id, 87);
    assert.equal(connection, db);
    startAt.setTime(0);
    return policy;
  });
  const result = await service.calculateResolutionDeadlineForPriority({ startAt, priorityId: 87, db });
  assert.equal(result.policy, policy);
  assert.equal(result.resolutionDueAt.toISOString(), "2026-01-01T04:00:00.000Z");
  const failure = new Error("Policy unavailable");
  lookup.mock.mockImplementation(async () => { throw failure; });
  await assert.rejects(service.calculateResolutionDeadlineForPriority({ startAt, priorityId: 87, db }), err => err === failure);
});

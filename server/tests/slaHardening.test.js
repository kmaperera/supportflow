const { test } = require("node:test");
const assert = require("node:assert/strict");
const sla = require("../src/modules/sla/slaCalculation.service");
const policies = require("../src/modules/sla/slaPolicy.service");
const errorHandler = require("../src/middleware/errorHandler");
const createdAt = new Date("2026-01-01T00:00:00Z");
const at = minutes => new Date(createdAt.getTime() + minutes * 60000);

test("deadline equality with creation is invalid; completion equality remains valid", () => {
  for (const [method, due, completion, elapsed] of [
    ["calculateFirstResponseSla", "responseDueAt", "firstResponseAt", "responseTimeMinutes"],
    ["calculateResolutionSla", "resolutionDueAt", "resolvedAt", "resolutionTimeMinutes"],
  ]) {
    for (const minutes of [-1, 0]) {
      assert.throws(() => sla[method]({ createdAt, [due]: at(minutes) }), RangeError);
    }
    assert.throws(() => sla[method]({ createdAt, [due]: at(30), [completion]: at(-0.5) }), RangeError);
    for (const minutes of [0, 0.5, 30]) {
      const result = sla[method]({ createdAt, [due]: at(30), [completion]: at(minutes) });
      assert.equal(result.result, "MET");
      assert.equal(result[elapsed], minutes);
    }
  }
});

test("combined timing rejects reversed deadlines, reversed completions and partial snapshots", () => {
  const input = { createdAt, responseDueAt: at(30), resolutionDueAt: at(60),
    firstResponseAt: at(20), resolvedAt: at(40) };
  assert.throws(() => sla.calculateTicketSlaStatus({ ...input, resolutionDueAt: at(29) }), /resolutionDueAt cannot precede/);
  assert.throws(() => sla.calculateTicketSlaStatus({ ...input, resolvedAt: at(19) }), /resolvedAt cannot precede/);
  for (const field of ["responseDueAt", "resolutionDueAt"]) {
    assert.throws(() => sla.calculateTicketSlaStatus({ ...input, [field]: null }), /Inconsistent SLA tracking data/);
  }
  assert.equal(sla.calculateTicketSlaStatus({ ...input, resolutionDueAt: at(30), resolvedAt: at(20) }).status, "MET");
  assert.equal(sla.calculateTicketSlaStatus({ ...input, responseDueAt: null, resolutionDueAt: null }).status, "NOT_TRACKED");
  assert.throws(() => sla.calculateTicketSlaStatus({ ...input, responseDueAt: null,
    resolutionDueAt: null, resolvedAt: at(19) }), /resolvedAt cannot precede/);
});

test("warning and breach states are exclusive at fractional boundaries for both targets", () => {
  for (const [warning, breach, due, completion] of [
    ["calculateResponseSlaWarning", "detectResponseBreach", "responseDueAt", "firstResponseAt"],
    ["calculateResolutionSlaWarning", "detectResolutionBreach", "resolutionDueAt", "resolvedAt"],
  ]) {
    for (const [minutes, isWarning, isBreached] of [[0.79, false, false], [0.8, true, false],
      [0.99, true, false], [1, false, false], [1.01, false, true]]) {
      const input = { createdAt, [due]: at(1), now: at(minutes) };
      assert.equal(sla[warning](input).isWarning, isWarning);
      assert.equal(sla[breach](input).isBreached, isBreached);
      assert.equal(sla[warning]({ ...input, [completion]: at(1.005) }).isWarning, false);
      assert.equal(sla[breach]({ ...input, [completion]: at(1.005) }).isBreached, false);
    }
  }
});

test("active-policy readers consistently reject missing, inactive and invalid configuration", async () => {
  for (const active of [false, 0, "0", null, undefined]) {
    const row = { is_active: active, response_time_minutes: 30, resolution_time_minutes: 60 };
    assert.equal(policies.mapSlaPolicy(row).isActive, false);
    const db = { async query() { return [[row]]; } };
    for (const method of ["getActivePolicyByPriorityId", "resolvePolicyForPriority"]) {
      await assert.rejects(policies[method](1, db), { statusCode: 409,
        message: "Active SLA policy is not available for this priority" });
    }
  }
  for (const method of ["getActivePolicyByPriorityId", "resolvePolicyForPriority"]) {
    const db = { async query(sql) { return [sql.includes("sla_policies") ? [] : [{ id: 1 }]]; } };
    await assert.rejects(policies[method](1, db), { statusCode: 409,
      message: "SLA policy is not configured for this priority" });
    await assert.rejects(policies[method](1, { async query() {
      return [[{ is_active: 1, response_time_minutes: 60, resolution_time_minutes: 30 }]];
    } }), { statusCode: 500 });
  }
});

test("policy identity and non-duration fields are rejected before any database access", async () => {
  const db = { query() { assert.fail("invalid update queried the database"); } };
  for (const field of ["id", "priorityId", "priority_id", "priorityName", "isActive", "createdAt", "updatedAt"]) {
    await assert.rejects(policies.updatePolicy(1, { responseTimeMinutes: 30,
      resolutionTimeMinutes: 60, [field]: 2 }, db), { statusCode: 422 });
  }
});

test("database failures never expose SQL or stack traces, including development responses", t => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  t.after(() => {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  });
  t.mock.method(console, "error", () => {});
  const res = { status(code) { assert.equal(code, 500); return this; }, json(body) {
    assert.deepEqual(body, { success: false, message: "Internal server error", errors: [] });
  } };
  errorHandler(new Error("SELECT secret FROM internal_table"), {}, res, () => assert.fail("unexpected next"));
});

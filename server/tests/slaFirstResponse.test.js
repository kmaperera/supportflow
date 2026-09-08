const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calculateFirstResponseSla: calculate } = require("../src/modules/sla/slaCalculation.service");
const { SLA_RESULTS } = require("../src/constants/slaResults");
const createdAt = new Date("2020-01-01T10:00:00Z");
const responseDueAt = new Date("2020-01-01T10:30:00Z");

test("completed responses meet the deadline inclusively and retain fractional minutes", () => {
  assert.ok(Object.isFrozen(SLA_RESULTS));
  for (const [time, result, elapsed, difference] of [
    ["10:20:30", "MET", 20.5, 9.5],
    ["10:30:00", "MET", 30, 0],
    ["10:35:15", "MISSED", 35.25, -5.25],
  ]) {
    const firstResponseAt = new Date(`2020-01-01T${time}Z`);
    const originals = [createdAt, responseDueAt, firstResponseAt].map(d => d.getTime());
    assert.deepEqual(calculate({ createdAt, responseDueAt, firstResponseAt }), {
      result, responseDueAt, firstResponseAt, responseTimeMinutes: elapsed, differenceMinutes: difference,
    });
    assert.deepEqual([createdAt, responseDueAt, firstResponseAt].map(d => d.getTime()), originals);
  }
});

test("historical deadlines are not tracked and old pending deadlines stay pending", () => {
  assert.deepEqual(calculate(), { result: "NOT_TRACKED", responseDueAt: null, firstResponseAt: null,
    responseTimeMinutes: null, differenceMinutes: null });
  assert.equal(calculate({ createdAt, responseDueAt }).result, "PENDING");
  assert.equal(calculate({ responseDueAt }).differenceMinutes, null);
  const historical = calculate({ createdAt, firstResponseAt: responseDueAt });
  assert.equal(historical.result, "NOT_TRACKED");
  assert.equal(historical.responseTimeMinutes, 30);
  assert.equal(historical.differenceMinutes, null);
  assert.equal(calculate({ responseDueAt, firstResponseAt: responseDueAt }).responseTimeMinutes, null);
});

test("all supplied dates are validated even when no deadline is tracked", () => {
  for (const name of ["createdAt", "responseDueAt", "firstResponseAt"]) {
    for (const value of [new Date(NaN), "2020-01-01", 0, {}, false]) {
      assert.throws(() => calculate({ [name]: value }), TypeError);
    }
  }
  assert.throws(() => calculate({ createdAt, responseDueAt: new Date(createdAt.getTime() - 1) }), RangeError);
  assert.throws(() => calculate({ createdAt, firstResponseAt: new Date(createdAt.getTime() - 1) }), RangeError);
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const sla = require("../src/modules/sla/slaCalculation.service");
const startAt = new Date("2020-01-01T10:00:00Z");
const dueAt = new Date("2020-01-01T11:00:00Z");

test("warning includes its threshold boundary, preserves fractions and excludes deadline/breach", () => {
  for (const remaining of [20, 12, 10, 0.001, 0, -10]) {
    const now = new Date(dueAt.getTime() - remaining * 60000);
    const before = [startAt, dueAt, now].map(d => d.getTime());
    assert.deepEqual(sla.calculateSlaWarning({ startAt, dueAt, now }), {
      isTracked: true, isWarning: remaining > 0 && remaining <= 12,
      thresholdPercent: 20, totalMinutes: 60, remainingMinutes: remaining, warningThresholdMinutes: 12,
    });
    assert.equal(sla.detectResponseBreach({ responseDueAt: dueAt, now }).isBreached, remaining < 0);
    assert.deepEqual([startAt, dueAt, now].map(d => d.getTime()), before);
  }
});

test("historical and completed targets have no active warning", () => {
  const now = new Date("2020-01-01T10:50:00Z");
  assert.deepEqual(sla.calculateSlaWarning({ startAt, now }), {
    isTracked: false, isWarning: false, thresholdPercent: 20,
    totalMinutes: null, remainingMinutes: null, warningThresholdMinutes: null,
  });
  for (const completedAt of [startAt, dueAt, new Date("2020-01-01T11:15:00Z")]) {
    const original = completedAt.getTime();
    const result = sla.calculateSlaWarning({ startAt, dueAt, completedAt, now });
    assert.equal(result.isWarning, false);
    assert.equal(result.remainingMinutes, null);
    assert.equal(completedAt.getTime(), original);
  }
});

test("wrappers delegate configurable percentage and completion fields", () => {
  const now = new Date("2020-01-01T10:50:00Z");
  for (const warningThresholdPercent of [10, 20, 100, 16.5]) {
    const expected = sla.calculateSlaWarning({ startAt, dueAt, now, warningThresholdPercent });
    assert.deepEqual(sla.calculateResponseSlaWarning({ createdAt: startAt, responseDueAt: dueAt, now, warningThresholdPercent }), expected);
    assert.deepEqual(sla.calculateResolutionSlaWarning({ createdAt: startAt, resolutionDueAt: dueAt, now, warningThresholdPercent }), expected);
  }
  assert.equal(sla.calculateResponseSlaWarning({ createdAt: startAt, responseDueAt: dueAt, firstResponseAt: now, now }).isWarning, false);
  assert.equal(sla.calculateResolutionSlaWarning({ createdAt: startAt, resolutionDueAt: dueAt, resolvedAt: now, now }).isWarning, false);
});

test("invalid thresholds, dates and impossible windows fail even for inactive warnings", () => {
  for (const warningThresholdPercent of [0, -1, 101, NaN, Infinity, "20", null, true]) {
    assert.throws(() => sla.calculateSlaWarning({ startAt, now: startAt, warningThresholdPercent }), TypeError);
  }
  for (const name of ["startAt", "dueAt", "completedAt", "now"]) {
    for (const value of [new Date(NaN), "2020-01-01", 0, {}]) {
      assert.throws(() => sla.calculateSlaWarning({ startAt, dueAt, now: startAt, [name]: value }), TypeError);
    }
  }
  for (const name of ["startAt", "now"]) {
    for (const value of [null, undefined]) {
      assert.throws(() => sla.calculateSlaWarning({ startAt, dueAt, now: startAt, [name]: value }), TypeError);
    }
  }
  for (const invalidDue of [startAt, new Date(startAt.getTime() - 1)]) {
    assert.throws(() => sla.calculateSlaWarning({ startAt, dueAt: invalidDue, now: startAt }), RangeError);
  }
  assert.throws(() => sla.calculateSlaWarning({ startAt, now: startAt, completedAt: new Date(startAt.getTime() - 1) }), RangeError);
});

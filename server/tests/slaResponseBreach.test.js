const { test } = require("node:test");
const assert = require("node:assert/strict");
const { detectResponseBreach: detect, calculateResponseSlaState: state } = require("../src/modules/sla/slaCalculation.service");

const responseDueAt = new Date("2020-01-01T10:30:00Z");

test("only unanswered tickets strictly past the deadline have an active breach", () => {
  for (const offset of [-60000, 0, 1, 915000]) {
    const now = new Date(responseDueAt.getTime() + offset);
    const originals = [responseDueAt.getTime(), now.getTime()];
    assert.deepEqual(detect({ responseDueAt, now }), {
      isTracked: true, isBreached: offset > 0,
      breachedAt: offset > 0 ? responseDueAt : null,
      overdueMinutes: offset > 0 ? offset / 60000 : 0,
    });
    assert.deepEqual([responseDueAt.getTime(), now.getTime()], originals);
  }
});

test("historical snapshots and completed late responses are not active breaches", () => {
  const now = new Date("2020-01-01T11:00:00Z");
  assert.deepEqual(detect({ responseDueAt: null, now }), {
    isTracked: false, isBreached: false, breachedAt: null, overdueMinutes: null,
  });
  for (const offset of [-60000, 0, 60000]) {
    const firstResponseAt = new Date(responseDueAt.getTime() + offset);
    const original = firstResponseAt.getTime();
    assert.deepEqual(detect({ responseDueAt, firstResponseAt, now }), {
      isTracked: true, isBreached: false, breachedAt: null, overdueMinutes: 0,
    });
    assert.equal(firstResponseAt.getTime(), original);
  }
});

test("explicit now and every supplied timestamp must be valid Dates", () => {
  for (const now of [undefined, null, "2020-01-01", 0, NaN, new Date(NaN), {}]) {
    assert.throws(() => detect({ now }), TypeError);
  }
  for (const name of ["responseDueAt", "firstResponseAt"]) {
    for (const value of ["2020-01-01", 0, NaN, new Date(NaN), {}, false]) {
      assert.throws(() => detect({ now: responseDueAt, [name]: value }), TypeError);
    }
  }
});

test("combined state keeps completed performance separate and retains timing validation", () => {
  const input = { createdAt: new Date("2020-01-01T10:00:00Z"), responseDueAt,
    now: new Date("2020-01-01T10:45:00Z") };
  const pending = state(input);
  assert.equal(pending.calculation.result, "PENDING");
  assert.equal(pending.breach.isBreached, true);
  assert.equal(pending.breach.overdueMinutes, 15);
  const late = state({ ...input, firstResponseAt: input.now });
  assert.equal(late.calculation.result, "MISSED");
  assert.equal(late.breach.isBreached, false);
  assert.throws(() => state({ ...input, firstResponseAt: new Date("2019-01-01T00:00:00Z") }), RangeError);
});

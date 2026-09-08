const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calculateResolutionSla: calculate } = require("../src/modules/sla/slaCalculation.service");
const { SLA_RESULTS } = require("../src/constants/slaResults");

const createdAt = new Date("2020-01-01T10:00:00Z");
const resolutionDueAt = new Date("2020-01-01T14:00:00Z");

test("resolution results include deadline equality and preserve fractional precision and input Dates", () => {
  for (const [time, result, elapsed, difference] of [
    ["13:30:30", SLA_RESULTS.MET, 210.5, 29.5],
    ["14:00:00", SLA_RESULTS.MET, 240, 0],
    ["14:15:15", SLA_RESULTS.MISSED, 255.25, -15.25],
  ]) {
    const resolvedAt = new Date(`2020-01-01T${time}Z`);
    const originals = [createdAt, resolutionDueAt, resolvedAt].map(date => date.getTime());
    assert.deepEqual(calculate({ createdAt, resolutionDueAt, resolvedAt }), {
      result, resolutionDueAt, resolvedAt, resolutionTimeMinutes: elapsed, differenceMinutes: difference,
    });
    assert.deepEqual([createdAt, resolutionDueAt, resolvedAt].map(date => date.getTime()), originals);
  }
});

test("missing deadlines are not tracked and old unresolved deadlines remain pending", () => {
  assert.deepEqual(calculate(), {
    result: SLA_RESULTS.NOT_TRACKED, resolutionDueAt: null, resolvedAt: null,
    resolutionTimeMinutes: null, differenceMinutes: null,
  });
  assert.deepEqual(calculate({ createdAt, resolutionDueAt, resolvedAt: null }), {
    result: SLA_RESULTS.PENDING, resolutionDueAt, resolvedAt: null,
    resolutionTimeMinutes: null, differenceMinutes: null,
  });
  const historical = calculate({ createdAt, resolutionDueAt: null, resolvedAt: resolutionDueAt });
  assert.equal(historical.result, SLA_RESULTS.NOT_TRACKED);
  assert.equal(historical.resolutionTimeMinutes, 240);
  assert.equal(historical.differenceMinutes, null);
  const noCreation = calculate({ resolutionDueAt, resolvedAt: resolutionDueAt });
  assert.equal(noCreation.result, SLA_RESULTS.MET);
  assert.equal(noCreation.resolutionTimeMinutes, null);
  assert.equal(noCreation.differenceMinutes, 0);
});

test("resolution timestamps must be valid Dates and cannot precede creation", () => {
  for (const name of ["createdAt", "resolutionDueAt", "resolvedAt"]) {
    for (const value of [new Date(NaN), "2020-01-01", 0, {}, false]) {
      assert.throws(() => calculate({ [name]: value }), TypeError);
    }
  }
  assert.throws(() => calculate({ createdAt, resolutionDueAt: new Date(createdAt.getTime() - 1) }), RangeError);
  assert.throws(() => calculate({ createdAt, resolvedAt: new Date(createdAt.getTime() - 1) }), RangeError);
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calculateOverallSlaStatus: overall, calculateTicketSlaStatus: ticketSla } = require("../src/modules/sla/slaCalculation.service");
const { SLA_RESULTS: R } = require("../src/constants/slaResults");

test("all sixteen component combinations follow tracking and precedence rules", () => {
  const results = [R.NOT_TRACKED, R.PENDING, R.MET, R.MISSED];
  const expected = [
    [R.NOT_TRACKED, null, null, null],
    [null, R.PENDING, R.PENDING, R.MISSED],
    [null, R.PENDING, R.MET, R.MISSED],
    [null, R.MISSED, R.MISSED, R.MISSED],
  ];
  results.forEach((responseResult, i) => results.forEach((resolutionResult, j) => {
    const run = () => overall({ responseResult, resolutionResult });
    if (expected[i][j] === null) assert.throws(run, /Inconsistent SLA tracking data/);
    else assert.equal(run(), expected[i][j]);
  }));
});

test("both component results must be supported primitive values", () => {
  for (const invalid of [undefined, null, "", "BREACHED", "WARNING", "unknown", 0, true, {}, [], new String("MET")]) {
    assert.throws(() => overall({ responseResult: invalid, resolutionResult: R.MET }), TypeError);
    assert.throws(() => overall({ responseResult: R.MISSED, resolutionResult: invalid }), TypeError);
  }
  assert.throws(() => overall(), TypeError);
});

test("combined calculator preserves details and Dates without treating old deadlines as breaches", () => {
  const input = {
    createdAt: new Date("2020-01-01T10:00:00Z"),
    responseDueAt: new Date("2020-01-01T10:30:00Z"),
    firstResponseAt: new Date("2020-01-01T10:20:30Z"),
    resolutionDueAt: new Date("2020-01-01T14:00:00Z"),
    resolvedAt: null,
  };
  const before = JSON.stringify(input);
  assert.deepEqual(ticketSla(input), {
    status: R.PENDING,
    response: { result: R.MET, responseDueAt: input.responseDueAt, firstResponseAt: input.firstResponseAt,
      responseTimeMinutes: 20.5, differenceMinutes: 9.5 },
    resolution: { result: R.PENDING, resolutionDueAt: input.resolutionDueAt, resolvedAt: null,
      resolutionTimeMinutes: null, differenceMinutes: null },
  });
  assert.equal(JSON.stringify(input), before);
  assert.equal(ticketSla({ ...input, resolvedAt: input.resolutionDueAt }).status, R.MET);
  assert.equal(ticketSla({ ...input, resolvedAt: new Date("2020-01-01T14:01:00Z") }).status, R.MISSED);
  assert.equal(ticketSla().status, R.NOT_TRACKED);
  assert.throws(() => ticketSla({ ...input, resolutionDueAt: null }), /Inconsistent SLA tracking data/);
  assert.throws(() => ticketSla({ ...input, resolvedAt: "invalid" }), TypeError);
});

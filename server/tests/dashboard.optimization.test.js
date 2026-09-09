const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/dashboard/dashboard.service");
const pool = require("../src/config/database");
const repository = require("../src/modules/dashboard/dashboard.repository");

test("summary pool reads start concurrently without changing results", async t => {
  const started = [];
  const release = [];
  for (const [name, result] of [["getAdminTicketSummary", { total_tickets: "4" }], ["countUnassignedQueue", 2], ["getAdminUserSummary", { total_technicians: "3" }]]) {
    t.mock.method(repository, name, () => { started.push(name); return new Promise(resolve => release.push(() => resolve(result))); });
  }
  const pending = service.getAdminDashboardSummary(pool);
  assert.equal(started.length, 3);
  release.forEach(resolve => resolve());
  const summary = await pending;
  assert.equal(summary.totalTickets, 4);
  assert.equal(summary.unassignedTickets, 2);
  assert.equal(summary.totalTechnicians, 3);
});

test("injected connections never receive overlapping summary or activity queries", async t => {
  let running = false;
  let calls = 0;
  const db = { async query(sql) {
    assert.equal(running, false);
    running = true;
    calls++;
    await new Promise(resolve => setImmediate(resolve));
    running = false;
    if (sql.includes("AS event_id")) return [[]];
    return [[{ total: 0 }]];
  } };
  await service.getAdminDashboardSummary(db);
  assert.equal(calls, 3);
  await service.getTechnicianDashboardSummary(2, db);
  assert.equal(calls, 5);
  assert.deepEqual(await service.getRecentTicketActivity({ id: 1, role: "ADMIN" }, 10, db), []);
  assert.equal(calls, 9);
});

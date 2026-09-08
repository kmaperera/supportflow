const { test } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/database');
const repo = require('../src/modules/tickets/ticket.repository');
const policies = require('../src/modules/sla/slaPolicy.service');
const service = require('../src/modules/tickets/ticket.service');
for (const employee of [false, true]) for (const scenario of ['escalate', 'deescalate', 'same', 'policyFailure', 'writeFailure', 'priorityNoRows', 'deadlineNoRows']) {
  test(`${employee ? 'employee edit' : 'support priority'}: ${scenario}`, async t => {
    const events = []; const failure = new Error('failure');
    const row = { id: 5, priority_id: 1, created_by: 3, assigned_to: 7, status: 'ASSIGNED',
      created_at: new Date('2020-01-01T10:00:00Z'), first_response_at: new Date('2020-01-01T10:15:00Z'),
      resolved_at: null, response_due_at: null, resolution_due_at: null };
    const initial = { ...row };
    const realtime = require('../src/modules/notifications/notificationRealtime.service');
    t.mock.method(realtime, 'emitNotification', () => assert.fail('unexpected priority notification'));
    t.mock.method(realtime, 'emitNotifications', () => assert.fail('unexpected priority notifications'));
    const db = { async beginTransaction() {}, async commit() { events.push('commit'); },
      async rollback() { Object.assign(row, initial); events.push('rollback'); }, release() {} };
    t.mock.method(pool, 'getConnection', async () => db);
    t.mock.method(repo, 'lockById', async (_, connection) => { assert.equal(connection, db); return row; });
    t.mock.method(repo, 'findById', async (_, connection) => { assert.equal(connection, db); return row; });
    t.mock.method(repo, 'findPriorityById', async (_, connection) => { assert.equal(connection, db); return { is_active: true }; });
    const minutes = scenario === 'deescalate' ? [480, 2880] : [30, 240];
    const lookup = t.mock.method(policies, 'resolvePolicyForPriority', async (id, connection) => {
      assert.equal(id, 2); assert.equal(connection, db); events.push('policy');
      if (scenario === 'policyFailure') throw failure;
      return { responseTimeMinutes: minutes[0], resolutionTimeMinutes: minutes[1] };
    });
    t.mock.method(repo, 'updatePriority', async (_, id, connection) => { assert.equal(connection, db); events.push('priority'); if (scenario === 'priorityNoRows') return 0; row.priority_id = id; return 1; });
    t.mock.method(repo, 'updateEmployeeDetails', async (_, data, connection) => { assert.equal(connection, db); events.push('priority'); if (scenario === 'priorityNoRows') return 0; row.priority_id = data.priorityId; return 1; });
    const update = t.mock.method(repo, 'updateSlaDeadlines', async (_, deadlines, connection) => {
      assert.equal(connection, db); events.push('deadlines');
      if (scenario === 'writeFailure') throw failure;
      if (scenario === 'deadlineNoRows') return 0;
      assert.equal(deadlines.responseDueAt.getTime(), row.created_at.getTime() + minutes[0] * 60000);
      assert.equal(deadlines.resolutionDueAt.getTime(), row.created_at.getTime() + minutes[1] * 60000);
      row.response_due_at = deadlines.responseDueAt; row.resolution_due_at = deadlines.resolutionDueAt; return 1;
    });
    const id = scenario === 'same' ? 1 : 2;
    const call = employee ? service.updateEmployeeTicket(5, 3, { priorityId: id })
      : service.updateTicketPriority(5, id, { id: 7, role: 'TECHNICIAN' });
    if (scenario.endsWith('Failure') || scenario.endsWith('NoRows')) {
      await assert.rejects(call, e => scenario.endsWith('Failure') ? e === failure :
        e.message === (scenario === 'priorityNoRows' ? 'Unexpected ticket priority update count' : 'Ticket SLA deadline update failed'));
      if (scenario === 'priorityNoRows') assert.equal(update.mock.callCount(), 0);
      assert.equal(events.includes('commit'), false); assert.equal(events.at(-1), 'rollback');
      assert.deepEqual(row, initial);
    } else {
      const result = await call;
      assert.equal(result.firstResponseAt, row.first_response_at);
      assert.equal(result.resolvedAt, null);
      assert.equal(events.at(-1), 'commit');
      if (scenario === 'same') { assert.equal(lookup.mock.callCount(), 0); assert.equal(update.mock.callCount(), 0); }
      else assert.equal(result.responseDueAt, row.response_due_at);
    }
  });
}

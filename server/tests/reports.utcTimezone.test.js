const { test } = require('node:test');
const assert = require('node:assert/strict');
const reports = require('../src/modules/reports/reports.repository');
const dashboard = require('../src/modules/dashboard/dashboard.repository');

test('UTC ticket filters and daily/monthly buckets survive non-UTC MySQL sessions',
  { skip: process.env.RUN_REPORT_DB_TESTS !== '1' }, async () => {
    require('dotenv').config({ quiet: true });
    const db = await require('mysql2/promise').createConnection({
      host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    });
    // Read-only CTEs model the session representation of TIMESTAMP instants.
    const instants = ['2001-01-01T23:59:59Z', '2001-01-02T00:00:00Z',
      '2001-01-02T23:59:59Z', '2001-01-03T00:00:00Z',
      '2001-01-31T23:59:59Z', '2001-02-01T00:00:00Z'];
    const fixture = `WITH tickets AS (${instants.map((value, i) =>
      `SELECT ${i + 1} id, 7 created_by, 8 assigned_to, FROM_UNIXTIME(${Date.parse(value) / 1000}) created_at`).join(' UNION ALL ')}) `;
    const adapter = { query: (sql, values) => db.query(fixture + sql, values) };
    try {
      for (const timezone of ['+00:00', '+05:30', '-07:00']) {
        await db.query('SET SESSION time_zone = ?', [timezone]);
        const filters = { startAt: '2001-01-02 00:00:00', endExclusive: '2001-01-03 00:00:00' };
        assert.equal(Number(await reports.countTicketReportRows({ filters }, adapter)), 2);
        assert.deepEqual(await reports.getDailyTicketCountsInDateRange({
          startDateTime: filters.startAt, endExclusiveDateTime: filters.endExclusive,
        }, adapter), [{ report_date: '2001-01-02', ticket_count: 2 }]);
        assert.deepEqual(await dashboard.getTicketTrend({ period: 'daily',
          startDate: filters.startAt, endDate: filters.endExclusive, createdBy: 7,
        }, adapter), [{ period_key: '2001-01-02', ticket_count: 2 }]);
        assert.deepEqual(await dashboard.getTicketTrend({ period: 'monthly',
          startDate: '2001-01-01 00:00:00', endDate: '2001-02-01 00:00:00', assignedTo: 8,
        }, adapter), [{ period_key: '2001-01', ticket_count: 5 }]);
        assert.equal(Number(await reports.countTicketReportRows({ filters: {
          startAt: '1000-01-01 00:00:00', endExclusive: '9999-01-01 00:00:00',
        } }, adapter)), 6);
      }
    } finally { await db.end(); }
  });

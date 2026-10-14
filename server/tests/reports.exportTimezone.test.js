const { test } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/modules/reports/reports.service');
const PDFDocument = require('pdfkit');

test('report, CSV and PDF timestamps preserve stored instants across session/host timezones',
  { skip: process.env.RUN_REPORT_DB_TESTS !== '1' }, async t => {
    require('dotenv').config({ quiet: true });
    const db = await require('mysql2/promise').createConnection({
      host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    });
    const epoch = Date.parse('2001-01-02T23:59:59Z') / 1000;
    const fixture = `WITH tickets AS (
      SELECT 1 id, 'SF-UTC' ticket_number, 'UTC export' title, 'RESOLVED' status,
        1 category_id, 1 priority_id, 1 created_by, 2 assigned_to,
        FROM_UNIXTIME(${epoch}) created_at,
        FROM_UNIXTIME(${epoch + 120}) first_response_at,
        FROM_UNIXTIME(${epoch + 3600}) resolved_at,
        FROM_UNIXTIME(${epoch + 300}) response_due_at,
        FROM_UNIXTIME(${epoch + 3600}) resolution_due_at
      ), ticket_categories AS (SELECT 1 id, 'Hardware' name),
      ticket_priorities AS (SELECT 1 id, 'HIGH' name), users AS (
        SELECT 1 id, 'Employee' first_name, 'Fixture' last_name, 'employee@example.test' email
        UNION ALL SELECT 2, 'Technician', 'Fixture', 'technician@example.test'
      ) `;
    const adapter = { query(options, params) {
      return db.query(typeof options === 'string' ? fixture + options :
        { ...options, sql: fixture + options.sql }, params);
    } };
    const texts = [], original = PDFDocument.prototype.text;
    t.mock.method(PDFDocument.prototype, 'text', function(value, ...args) {
      texts.push(String(value)); return original.call(this, value, ...args);
    });
    try {
      for (const timezone of ['+00:00', '+05:30', '-07:00']) {
        await db.query('SET SESSION time_zone = ?', [timezone]);
        const { report } = await service.getTicketReportQuery({ startDate: '2001-01-02', endDate: '2001-01-02' }, adapter);
        assert.equal(report.pagination.totalItems, 1);
        const offsets = { createdAt: 0, firstResponseAt: 120, resolvedAt: 3600, responseDueAt: 300, resolutionDueAt: 3600 };
        const { csv } = await service.getTicketCsvExport({}, adapter);
        for (const [field, seconds] of Object.entries(offsets)) {
          const expected = new Date((epoch + seconds) * 1000).toISOString();
          assert.equal(report.rows[0][field].toISOString(), expected);
          assert.ok(csv.includes(expected));
        }
        texts.length = 0;
        const { pdfBuffer } = await service.getTicketPdfExport({}, adapter);
        assert.ok(pdfBuffer.subarray(0, 5).equals(Buffer.from('%PDF-')));
        for (const seconds of [0, 120, 3600]) {
          assert.ok(texts.includes(`${new Date((epoch + seconds) * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`));
        }
      }
    } finally { await db.end(); }
  });

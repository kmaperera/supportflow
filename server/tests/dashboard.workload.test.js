const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/modules/dashboard/dashboard.service");
const pool = require("../src/config/database");
const users = require("../src/modules/users/user.repository");
const jwt = require("jsonwebtoken");

function database() {
  const technicians = [{ id: 7, name: "Alice Tech", active: 0 }, { id: 8, name: "Bob Tech", active: 1 }, { id: 9, name: "Zero Tech", active: 1 }];
  const tickets = ["ASSIGNED", "IN_PROGRESS", "WAITING_FOR_USER", "REOPENED", "RESOLVED", "CLOSED", "OPEN"].map(status => ({ assigned: 7, status }));
  tickets.push({ assigned: null, status: "OPEN" });
  return { tickets, async query(sql) {
    assert.match(sql, /FROM users AS u LEFT JOIN tickets AS t ON t.assigned_to = u.id/);
    assert.match(sql, /WHERE u.role = 'TECHNICIAN'\s+GROUP BY/);
    assert.match(sql, /ORDER BY active_tickets DESC, technician_name ASC, technician_id ASC/);
    assert.match(sql, /status IN \('ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'REOPENED'\)/);
    assert.doesNotMatch(sql, /ticket_assignments|password_hash|UPDATE|INSERT|DELETE/);
    const rows = technicians.map(technician => {
      const owned = tickets.filter(ticket => ticket.assigned === technician.id);
      const [first_name, last_name] = technician.name.split(" ");
      const row = { technician_id: String(technician.id), first_name, last_name, technician_name: technician.name, email: "tech@example.test", is_active: technician.active,
        active_tickets: String(owned.filter(ticket => ["ASSIGNED", "IN_PROGRESS", "WAITING_FOR_USER", "REOPENED"].includes(ticket.status)).length) };
      for (const status of ["ASSIGNED", "IN_PROGRESS", "WAITING_FOR_USER", "REOPENED", "RESOLVED"]) {
        assert.ok(sql.includes(`COALESCE(SUM(t.status = '${status}'), 0)`));
        row[`${status.toLowerCase()}_tickets`] = String(owned.filter(ticket => ticket.status === status).length);
      }
      return row;
    });
    return [rows.sort((a, b) => Number(b.active_tickets) - Number(a.active_tickets) || a.technician_name.localeCompare(b.technician_name) || Number(a.technician_id) - Number(b.technician_id))];
  } };
}

test("workload retains inactive and empty technicians and reflects current reassignment", async () => {
  const db = database();
  const rows = await service.getTechnicianWorkloadAnalytics(db);
  assert.deepEqual(rows[0], { technicianId: 7, technicianName: "Alice Tech", email: "tech@example.test", isActive: false,
    assignedTickets: 1, inProgressTickets: 1, waitingForUserTickets: 1, reopenedTickets: 1, activeTickets: 4, resolvedTickets: 1 });
  assert.equal(rows.length, 3);
  for (const row of rows.slice(1)) assert.ok(Object.entries(row).filter(([key]) => key.endsWith("Tickets")).every(([, count]) => count === 0));
  db.tickets[0].assigned = 8;
  const reassigned = await service.getTechnicianWorkloadAnalytics(db);
  assert.equal(reassigned.find(row => row.technicianId === 7).activeTickets, 3);
  assert.equal(reassigned.find(row => row.technicianId === 8).activeTickets, 1);
  db.tickets[0].assigned = null;
  assert.equal((await service.getTechnicianWorkloadAnalytics(db)).find(row => row.technicianId === 8).activeTickets, 0);
  assert.deepEqual(await service.getTechnicianWorkloadAnalytics({ async query() { return [[]]; } }), []);
});

test("workload maps safe names, numeric defaults and active flags without exposing auth fields", async () => {
  const rows = await service.getTechnicianWorkloadAnalytics({ async query() {
    return [[{ technician_id: "12", first_name: " Alice ", last_name: " Tech ", is_active: "1", email: "a@example.test", password_hash: "private", assigned_tickets: null },
      { technician_id: "13", first_name: null, last_name: " Tech ", is_active: "0" }]];
  } });
  assert.deepEqual(rows[0], { technicianId: 12, technicianName: "Alice Tech", email: "a@example.test", isActive: true,
    assignedTickets: 0, inProgressTickets: 0, waitingForUserTickets: 0, reopenedTickets: 0, activeTickets: 0, resolvedTickets: 0 });
  assert.equal(rows[1].technicianName, "Tech");
  assert.equal(rows[1].isActive, false);
});

test("workload route requires ADMIN before database access and rejects filters", async (t) => {
  const variables = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "JWT_ACCESS_SECRET"];
  const saved = variables.map(key => process.env[key]);
  variables.forEach(key => { process.env[key] = "workload-test"; });
  t.after(() => variables.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  const app = require("../src/app");
  t.mock.method(users, "findById", async id => ({ id, role: { 1: "EMPLOYEE", 2: "TECHNICIAN", 3: "ADMIN" }[id], is_active: 1 }));
  const db = database();
  const query = t.mock.method(pool, "query", db.query);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/dashboard/technician-workload`;
  const get = (actor, suffix = "") => fetch(url + suffix, { headers: actor ? {
    authorization: `Bearer ${jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET, { subject: String(actor), expiresIn: "5m" })}`,
  } : {} });
  assert.equal((await get(null)).status, 401);
  for (const actor of [1, 2]) assert.equal((await get(actor)).status, 403);
  for (const key of ["dateFrom", "dateTo", "month", "year", "role", "technicianId"]) assert.equal((await get(3, `?${key}=1`)).status, 422);
  assert.equal(query.mock.callCount(), 0);
  const response = await get(3);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.message, "Technician workload retrieved successfully");
  assert.equal(body.data.technicians.length, 3);
  assert.equal(query.mock.callCount(), 1);
});

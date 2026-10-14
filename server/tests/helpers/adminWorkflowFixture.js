// Phase 19.6 only: extend the existing rollback-isolated real HTTP/MySQL fixture.
module.exports = async function adminWorkflowFixture() {
  const fixture = await require('./employeeWorkflowFixture')({ includeTechnicianB: true });
  const sockets = new Set();
  const active = new Map();
  fixture.io.httpServer.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => { sockets.delete(socket); active.delete(socket); });
  });
  fixture.io.httpServer.on('request', (request, response) => {
    const socket = request.socket;
    active.set(socket, (active.get(socket) || 0) + 1);
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      active.set(socket, Math.max(0, (active.get(socket) || 1) - 1));
    };
    response.once('finish', done);
    response.once('close', done);
  });
  const cleanup = fixture.cleanup;
  fixture.cleanup = async () => {
    // Close idle fixture-owned transports (including upgrade leftovers) while
    // the API drains. Never interrupt a socket with an active HTTP response.
    const idle = setInterval(() => {
      fixture.io.httpServer.closeIdleConnections();
      for (const socket of sockets) if (!active.get(socket)) socket.destroy();
    }, 250);
    try { await cleanup(); } finally { clearInterval(idle); }
  };
  try {
    const [source] = await fixture.connection.execute('SELECT password_hash FROM users WHERE id=?', [fixture.users[0].id]);
    for (let index = 0; index < 16; index++) {
      const email = `admin-page-${fixture.run}-${index}@example.test`;
      const [row] = await fixture.connection.execute("INSERT INTO users (first_name,last_name,email,password_hash,role,is_active,must_change_password) VALUES ('Admin pagination','Fixture',?,?,'EMPLOYEE',TRUE,FALSE)", [email, source[0].password_hash]);
      fixture.users.push({ id: String(row.insertId), email, role: 'EMPLOYEE' });
    }
    return fixture;
  } catch (error) { await fixture.cleanup(); throw error; }
};

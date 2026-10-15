const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

test('root entry exports one HTTP/socket server without listening; REST and websocket share it', async t => {
  Object.assign(process.env, { NODE_ENV: 'test', CLIENT_URL: 'http://localhost:5173',
    DB_HOST: 'localhost', DB_USER: 'fixture', DB_PASSWORD: 'fixture', DB_NAME: 'fixture',
    JWT_ACCESS_SECRET: randomBytes(40).toString('hex'), JWT_REFRESH_SECRET: randomBytes(40).toString('hex'),
    JWT_ACCESS_EXPIRES_IN: '15m', JWT_REFRESH_EXPIRES_IN: '7d',
    CLOUDINARY_CLOUD_NAME: 'fixture', CLOUDINARY_API_KEY: 'fixture', CLOUDINARY_API_SECRET: 'fixture' });
  const pool = require('../src/config/database');
  t.mock.method(pool, 'query', async () => [[{ value: 1 }]]);
  const actor = { id: 7, role: 'EMPLOYEE', is_active: true, must_change_password: false };
  t.mock.method(require('../src/modules/users/user.repository'), 'findById', async () => actor);
  const server = require('../server');
  assert.equal(server, require('../src/httpServer'));
  assert.equal(server.listening, false);
  const io = require('../src/config/socket').getIO();
  assert.equal(require('../src/config/socket').initializeSocket(server), io);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const client = require('socket.io-client').io(origin, { transports: ['websocket'],
    auth: { token: require('../src/utils/jwt').generateAccessToken(actor) },
    extraHeaders: { Origin: process.env.CLIENT_URL }, reconnection: false });
  try {
    const response = await fetch(origin + '/api/v1/health');
    assert.equal(response.status, 200);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Websocket timeout')), 3000);
      client.once('connect', () => { clearTimeout(timer); resolve(); });
      client.once('connect_error', error => { clearTimeout(timer); reject(error); });
    });
    assert.equal(client.io.engine.transport.name, 'websocket');
    assert.ok(io.sockets.adapter.rooms.has('user:7'));
  } finally { client.disconnect(); await new Promise(resolve => io.close(resolve)); }
});

test('DB pool defaults conservatively and rejects unsafe overrides', () => {
  const { poolLimit } = require('../src/config/databasePool');
  assert.equal(poolLimit({}), 5);
  assert.equal(poolLimit({ DB_POOL_LIMIT: '2' }), 2);
  for (const value of ['0', '11', 'false', '2.5']) assert.throws(() => poolLimit({ DB_POOL_LIMIT: value }), /DB_POOL_LIMIT/);
});

test('proxy trust is restricted to the Vercel production hop', () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL };
  const path = require.resolve('../src/app');
  try {
    for (const [NODE_ENV, VERCEL, expected] of [['production', '1', 1], ['development', '1', false], ['production', '0', false]]) {
      Object.assign(process.env, { NODE_ENV, VERCEL });
      delete require.cache[path];
      const app = require('../src/app');
      assert.equal(app.get('trust proxy'), expected);
      const trust = app.get('trust proxy fn');
      assert.equal(trust('127.0.0.1', 0), expected === 1);
      assert.equal(trust('203.0.113.9', 1), false);
    }
  } finally {
    delete require.cache[path];
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { logDevelopmentStartupError } = require('../src/utils/startupError');

test('local startup exposes sanitized message and code without credentials or error objects', () => {
  const env = { DB_PASSWORD: 'sensitive-password', DB_HOST: 'private-host', JWT_ACCESS_SECRET: 'private-jwt' };
  const lines = [];
  logDevelopmentStartupError({ message: 'TLS required: private-host sensitive-password private-jwt mysql://user:pass@host/db\nfailed', code: 'ER_SECURE_TRANSPORT_REQUIRED', sql: 'private SQL' }, env, (...args) => lines.push(args));
  const output = JSON.stringify(lines);
  for (const secret of [...Object.values(env), 'user:pass', 'private SQL']) assert.ok(!output.includes(secret));
  assert.ok(output.includes('TLS required'));
  assert.ok(output.includes('ER_SECURE_TRANSPORT_REQUIRED'));
});

test('production and test environments retain generic startup logging only', () => {
  for (const NODE_ENV of ['production', 'test']) {
    logDevelopmentStartupError(new Error('private detail'), { NODE_ENV }, () => assert.fail('Must not log details'));
  }
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { logEmailFailure } = require('../src/utils/emailDiagnostic');

test('SMTP diagnostics retain allowlisted codes but exclude all arbitrary provider content', t => {
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  logEmailFailure('send', { name: 'Error', code: 'EAUTH', responseCode: 535, command: 'AUTH LOGIN',
    message: 'private-user private-password token=private-token', response: 'private-response',
    auth: { user: 'private-user', pass: 'private-password' } });
  assert.deepEqual(logs[0], ['Email operation failed', { stage: 'send', name: 'Error', code: 'EAUTH',
    message: 'SMTP authentication failed', responseCode: 535, command: 'AUTH LOGIN' }]);
  logEmailFailure('private-stage', { name: 'private-name', code: 'private-code', command: 'AUTH private-password', responseCode: 'private-response', message: 'private-token' });
  assert.ok(!JSON.stringify(logs).includes('private-'));
});

test('send failures log original SMTP code before returning a safe public error', async t => {
  const mailer = require('../src/config/mailer');
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  t.mock.method(mailer, 'getDefaultFrom', () => ({ name: 'Fixture', address: 'fixture@example.test' }));
  t.mock.method(mailer, 'getMailerTransporter', () => ({ async sendMail() {
    throw Object.assign(new Error('private SMTP response'), { code: 'ETIMEDOUT', command: 'CONN' });
  } }));
  await assert.rejects(require('../src/services/email.service').sendEmail({ to: 'recipient@example.test', subject: 'Fixture', text: 'token=private-token' }),
    { statusCode: 502, message: 'Email delivery failed' });
  assert.equal(logs[0][1].stage, 'send');
  assert.equal(logs[0][1].code, 'ETIMEDOUT');
  assert.ok(!JSON.stringify(logs).includes('private'));
});

test('configuration failure is distinguished from reaching sendMail', async t => {
  const mailer = require('../src/config/mailer');
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  t.mock.method(mailer, 'getMailerTransporter', () => { throw new Error('private config'); });
  await assert.rejects(require('../src/services/email.service').sendEmail({ to: 'recipient@example.test', subject: 'Fixture', text: 'Fixture' }), { statusCode: 502 });
  assert.equal(logs[0][1].stage, 'configuration');
  assert.ok(!JSON.stringify(logs).includes('private'));
});

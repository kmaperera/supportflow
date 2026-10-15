const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rootCertificates } = require('node:tls');
const { databaseSsl } = require('../src/config/databaseSsl');

test('MySQL TLS is opt-in; false does not enable TLS', () => {
  assert.equal(databaseSsl({}), undefined);
  assert.equal(databaseSsl({ DB_SSL: 'false' }), undefined);
  for (const DB_SSL of ['', 'yes', '1', 'TRUE']) {
    assert.throws(() => databaseSsl({ DB_SSL }), /DB_SSL must be true or false/);
  }
});

test('MySQL TLS always verifies certificates and supports system or provider CAs', () => {
  assert.deepEqual(databaseSsl({ DB_SSL: 'true' }), { rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2' });
  for (const ca of [rootCertificates[0], rootCertificates[0].replace(/\n/g, '\\n')]) {
    const ssl = databaseSsl({ DB_SSL: 'true', DB_SSL_CA: ca });
    assert.equal(ssl.ca, rootCertificates[0]);
    assert.equal(ssl.rejectUnauthorized, true);
    assert.equal(ssl.verifyIdentity, true);
  }
});

test('invalid or disabled CA configuration fails without exposing its value', () => {
  assert.throws(() => databaseSsl({ DB_SSL: 'false', DB_SSL_CA: 'private-marker' }), /^Error: DB_SSL_CA requires DB_SSL=true$/);
  for (const ca of ['private-marker', '-----BEGIN CERTIFICATE-----\nprivate-marker\n-----END CERTIFICATE-----']) {
    assert.throws(() => databaseSsl({ DB_SSL: 'true', DB_SSL_CA: ca }), /^Error: DB_SSL_CA must contain valid PEM CA certificates$/);
  }
});

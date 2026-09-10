// Run against a running backend: node tests/authCors.smoke.mjs
// Only invalid/empty credentials are sent; no account data is changed.
import assert from 'node:assert/strict';

const base = process.env.TEST_API_URL || 'http://localhost:5000/api/v1';
const origin = process.env.TEST_CLIENT_ORIGIN || 'http://localhost:5173';

for (const [method, path, expectedStatus, authorization] of [
  ['PATCH', 'change-password', 401],
  ['PATCH', 'change-password', 401, 'Bearer invalid-test-token'],
  ['POST', 'login', 422],
  ['POST', 'refresh', 401],
]) {
  const url = `${base}/auth/${path}`;
  const preflight = await fetch(url, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': method,
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  assert.ok(preflight.headers.get('access-control-allow-methods').split(/\s*,\s*/).includes(method));
  const headers = preflight.headers.get('access-control-allow-headers').toLowerCase().split(/\s*,\s*/);
  assert.ok(headers.includes('authorization') && headers.includes('content-type'));

  const response = await fetch(url, {
    method,
    headers: {
      Origin: origin, 'Content-Type': 'application/json',
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: '{}',
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, expectedStatus);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  const body = await response.json();
  if (authorization) assert.equal(body.message, 'Invalid access token');
  console.log(`${method} ${path}: preflight passed; backend returned ${response.status}`);
}

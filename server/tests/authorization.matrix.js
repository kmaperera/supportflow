// Regenerates the review document from actual mounts and the reviewed service
// conditions already shared by the existing permission regression tests.
require('dotenv').config({ quiet: true });
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { routes } = require('./helpers/endpointInventory').loadInventory();
const policies = require('./helpers/permissionMatrix.json');
const key = row => row.method + ' ' + row.path;
assert.deepEqual(routes.map(key).sort(), policies.map(key).sort());
const rows = routes.map(route => {
  const policy = policies.find(row => key(row) === key(route));
  const authenticated = route.auth === 'Bearer';
  const roleList = route.roles.startsWith('All authenticated') ? ['EMPLOYEE', 'TECHNICIAN', 'ADMIN'] : route.roles.split(', ');
  if (authenticated) {
    const expected = policy.access === 'authenticated' ? ['EMPLOYEE', 'TECHNICIAN', 'ADMIN'] : policy.access.split('/');
    assert.deepEqual(roleList.slice().sort(), expected.sort(), 'Reviewed roles differ from live middleware');
  } else assert.ok(['public', 'cookie/public'].includes(policy.access));
  const cells = ['EMPLOYEE', 'TECHNICIAN', 'ADMIN'].map(role => authenticated ? roleList.includes(role) ? 'ALLOW*' : '403' : policy.access === 'public' ? 'Public' : 'Credentials/cookie');
  const deny = !authenticated ? policy.access === 'public' ? 'No role gate' : '401 invalid credentials/cookie; logout is idempotent' : '401 absent bearer; 403 wrong role; hidden objects 404; state conflict 409';
  return `| ${route.method} | \`${route.path}\` | ${cells.join(' | ')} | ${policy.rule} | ${deny} |`;
});
fs.writeFileSync(path.join(__dirname, '../AUTHORIZATION_MATRIX.md'), '# Phase 19.3 — authorization matrix\n\nGenerated from actual Express mounts and middleware with `node tests/authorization.matrix.js` on 2026-10-14. All 99 API method/path pairs match the existing reviewed service-policy matrix. ALLOW* denotes role eligibility subject to the resource/state condition, not permission to every object. This matrix describes policy; execution evidence and test limits are in [the results report](AUTHORIZATION_TEST_RESULTS.md).\n\nShared dashboard routes are scoped, not uniformly Admin-only. Technician queue/read policy permits unassigned or own assigned tickets; mutation/upload normally requires assignment. Employee `priorityId` editing on own OPEN/ASSIGNED tickets is intentional. Notification ownership has no Admin bypass. Stateless bearer claims never override the current DB role/activity. Public/cookie auth endpoints are not role-gated bearer APIs.\n\n| Method | Full route | Employee | Technician | Admin | Additional ownership/resource condition | Expected denial |\n| --- | --- | --- | --- | --- | --- | --- |\n' + rows.join('\n') + '\n');
console.log(`PASS: ${routes.length} actual endpoints match reviewed roles; authorization matrix generated.`);
require('../src/config/database').end();

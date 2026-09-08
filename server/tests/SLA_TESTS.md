Run from `server` with Node.js 22.18 or later and installed dependencies:

```sh
npm run test:sla
```

The suite uses the existing `node:test` and `node:assert/strict` framework. No additional test dependencies are required. The command selects `sla*.test.js` plus ticket priority, creation transaction, and first-response workflow tests. Existing application and seed scripts are unchanged.

Calculation coverage includes deadline arithmetic and Date immutability, completion results and fractional durations, overall precedence, invalid/partial timestamps, strict breach boundaries, and warning thresholds and wrappers. Service tests cover policy validation, missing/inactive policies, mapping, immutable identity, and SQL parameter binding.

Workflow tests cover priority escalation/de-escalation from original creation time, unchanged-priority behavior, simulated transaction rollback, creation failures, warning recipients/content/dedupe, and post-commit emission. `slaSnapshot.test.js` runs the real ticket and policy services over in-memory repository doubles to verify policy updates preserve old snapshots and affect future tickets.

`slaPolicy.listApi.test.js` exercises the mounted Express app over a temporary loopback HTTP port, with real authentication/authorization and validation middleware. User lookups and SQL are mocked. It covers ADMIN/EMPLOYEE/TECHNICIAN/anonymous access, role spoofing, mapped GET responses, PATCH validation, missing policies, and GET after PATCH.

Fixtures use fixed instants; tests that need Date for JWT or ticket-number generation freeze Date through Node's mock timers. They do not sleep or wait for SLA deadlines. Repository/SQL mocks and in-memory transaction state prevent persistent database or policy changes. Temporary servers close and mocks/environment changes are restored after tests.

Real MySQL rollback, schema/index enforcement under concurrent inserts, and delivery through a deployed Socket.IO server remain manual Phase 9.20 checks. Simulated rollback and duplicate-key errors verify application behavior without claiming live-database integration coverage.

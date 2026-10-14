# Phase 19.1 — Backend endpoint regression results

Reviewed 2026-10-14, starting from clean `main` at `053edf0` (completed Phase 18). Scope is broad backend mounting and response contracts only; Phase 19.2+ was not started. No production source, frontend, database schema, dependencies or response formats were changed.

## Inventory and results

The [endpoint matrix](ENDPOINT_REGRESSION_MATRIX.md) contains **99 method/path pairs from ten route files**, including full `/api/v1` paths, authentication, route-level roles, exported controller identity and executed statuses. All 99 received at least one successful real HTTP/MySQL smoke response. No API endpoint is omitted or marked PASS based only on source inspection.

| Route file/module | Endpoints | Executed representative coverage | Result |
| --- | ---: | --- | --- |
| health/health.routes.js | 1 | Live health UP/UP; simulated query failure with safe 500 | PASS |
| auth/auth.routes.js | 6 | Login, refresh, logout, logout-all, me, password change; fixture credentials/cookies | PASS |
| users/user.routes.js | 8 | List/detail/create/profile update, role/state, assignable technicians/workload; empty search and missing resource | PASS |
| tickets/ticket.routes.js | 33 | Categories/priorities, category management, create/list/detail/edit, queue/assigned/workflow summary, assignment actions/history, status/priority/resolve/reopen/close/feedback, public/internal comments, direct/comment attachments/list/download/delete | PASS |
| notifications/notification.routes.js | 3 | List, read, read-all; missing notification | PASS |
| sla/slaPolicy.routes.js | 2 | List and update discovered policy; ticket due dates; missing policy | PASS |
| knowledgeBase/knowledgeBase.routes.js | 14 | Category list/create/update/state; article create/read/list/edit/publish/unpublish/archive, suggestions and GET/PUT feedback; missing article | PASS |
| dashboard/dashboard.routes.js | 15 | Employee/Technician/Admin summaries and every statistics/analytics endpoint; invalid trend period | PASS |
| reports/reports.routes.js | 16 | All seven JSON reports, seven CSV exports and two PDF exports with valid date range; malformed date | PASS |
| audit/audit.routes.js | 1 | Admin GET, parseable timestamps/numeric pagination, invalid query | PASS |

The inventory helper captures actual Express router mounts and route stacks, resolves controller references from loaded modules, checks unique method/path pairs, checks the API prefix and compares discovered route files with mounted route files. It is test-only; no production route-map endpoint was added. Middleware roles are descriptive, not a substitute for service ownership/state policy. Existing Phase 18 permission tests remain available rather than recreating a deep role matrix here.

The root `/` API liveness response and Socket.IO `/socket.io` transport path are intentional exceptions outside the 99-route API inventory. Socket.IO initializes in normal startup and the harness; no new realtime delivery test was developed for 19.1. No separate priority-management, profile-upload, KB-upload, KB-delete or analytics router exists. Analytics uses dashboard endpoints; ticket SLA data is in ticket responses.

## Executed regression checks

`node tests/endpoints.mysql.smoke.js` passed **133 HTTP contract checks**, covering all 99 endpoints plus shallow error/contract cases. All JSON responses had the established success/error envelopes and application/json MIME. The harness checks middleware headers and trusted-origin credentials grants on normal and error responses. CSV/PDF/attachment downloads returned the intended non-JSON MIME, nonempty bytes and attachment disposition; PDF outputs began with `%PDF-`. Export metrics/content correctness is reserved for later phases.

Additional checks passed:

- Static ticket category/priority/my/queue/workflow paths reached their intended controllers before dynamic ticket detail matching; user lookup/workload static paths worked. No duplicate, unmounted, wrongly prefixed, missing-controller or accidental legacy API route was found.
- Safe nonexistent-route 404; DELETE on GET-only audits and PUT on PATCH-only user update returned the established JSON 404. The final 404 middleware follows valid mounts, with the error handler last.
- Malformed JSON 400, empty/unsuitable-content-type login input 422, excessive JSON 413, unauthenticated 401, forbidden 403, absent resources 404, stale assignment/reopen conflict 409 and simulated unexpected health failure 500. Numeric missing IDs were verified absent in the local DB before requests. No accidental 200-on-error or unexpected 500-on-client-error was found. No new rate-limit threshold testing was performed; the existing suite supplies its 429 coverage.
- User search/role/active/ascending-sort pagination, ticket status/priority/category/search/date/pagination combined filters and ascending/descending sorting, and empty/special-character searches worked. Pagination totals stayed numeric, activity flags boolean, nullable phone/resolution fields safe, and ticket/audit timestamps parseable.
- Admin unassign accepted the discovered current `expectedAssignmentId`; a stale ID returned 409. Reassignment still uses the actual `{ technicianId }` contract. Route/controller parameter names matched exercised requests, including ticket feedback's `ticketId`, attachment/comment IDs, KB IDs and SLA `policyId`.
- Transactional refresh/assignment/lifecycle endpoints completed normally using service savepoints; no open savepoints remained. No pool-exhaustion, acquisition-timeout, unhandled-rejection, unexpected error/warning or unexpected server-fault signal was observed. This is not load testing or certification of pool behavior at scale.

## Existing contracts preserved

General field validation is **422**, while malformed JSON and audit-query validation use **400**. Multipart/provider/status codes retain the prior documented contracts. Logout, logout-all and password-change successes intentionally omit `data`; attachment deletion uses `data: null`. They were not normalized to an invented common shape.

Users and tickets return top-level pagination using `currentPage`, `totalRecords`, `totalPages`, `hasNext` and `hasPrevious`. Audit pagination is under `data.pagination`, with `page`, `total`, `hasNextPage` and `hasPreviousPage`; KB/notifications/reports retain their existing response structures. Initial new-harness assertions incorrectly assumed a universal `data` object and pagination layout; these assertions were corrected after inspecting the actual frontend/controller contracts. They were test-construction findings, not application defects. A harness Socket.IO initialization omission was also corrected before final execution.

Reviewed frontend API modules against the real routes and controllers: auth, users, tickets, categories, SLA, attachments, notifications, KB/Admin KB, dashboard, reports/exports and audits. Active calls matched methods, params and body/query names. Unused legacy constants for `/categories`, `/priorities` and `/sla-policies` are not active requests; current callers correctly use `/tickets/categories`, `/tickets/priorities` and `/sla/policies`. Valid backend-only APIs were retained. Controllers use the existing asyncHandler/central error handler; no missing await/old service-shape regression was confirmed.

The existing `postman/ticket-categories.postman_collection.json` was inspected and retained. It covers category requests using `baseUrl`, empty token variables and a captured category ID; no operational credential values were found. Executable tests cover those requests more safely inside a rollback, so the Postman mutation sequence was not also run to leave duplicate data. No Postman environment or collection was rewritten.

## Baseline, final verification and gaps

- **Before changes:** `node --test tests/*.test.js` — 379 passed, zero failed, one opt-in skipped (380 total). Clean normal startup and live MySQL health passed.
- **After test additions:** same backend suite — 379 passed, zero failed, one opt-in skipped. `npm run test:sla` — 89 passed, zero failed (overlapping coverage). The skipped reports test is explicitly opt-in and was not enabled in 19.1; its earlier successful run is recorded in Phase 18.19.
- Final endpoint harness — 99/99 successful endpoints, 133 HTTP checks, rollback verified. `node --check` on added JavaScript and `git diff --check` passed.
- Final clean backend restart, DB connection, route mounting and Socket.IO initialization passed. No scheduler is started by the current `src/server.js`; none was invented. No new startup warning/error was found.
- `server/package.json` has no generic npm test, lint or coverage script/config. Tests ran through the existing Node runner and test:sla script. No nonexistent script, new test framework, coverage system or frontend integration phase was introduced.

**NOT TESTED against live external systems:** Cloudinary upload/download/delete and actual SMTP delivery. Upload/download/deletion providers and mail transport are test doubles only within the smoke process; real multipart parsing, auth, controllers, services, SQL and metadata persistence remain exercised. No actual Cloudinary asset or email was created. Full feature metrics, authentication edge semantics, exhaustive role/lifecycle combinations, Socket.IO delivery, load behavior and deployed E2E are outside 19.1, not implied by this PASS.

## Data safety, reproduction and changes

The harness refuses production mode and non-loopback DB hosts. It requires the existing local schema and an active seeded priority/SLA pair, discovers their IDs, and generates unique fixture identities. All mutations run in a caller-owned outer transaction; inner business transactions use savepoints. Rollback removes users, sessions, tickets, comments, attachments, KB changes, notifications, audit events and the temporary SLA change. Post-rollback queries verify zero retained fixture users/tickets/sessions/notifications/audits. Existing user records, audit history and provider assets were not deleted. Rolled-back AUTO_INCREMENT allocations can leave gaps.

From `server/`, run:

```powershell
node tests/endpoints.mysql.smoke.js
```

To regenerate the intentional matrix document after a successful run:

```powershell
$env:ENDPOINT_MATRIX = '1'
node tests/endpoints.mysql.smoke.js
Remove-Item Env:ENDPOINT_MATRIX
```

**Bugs/fixes:** no confirmed production endpoint bug; no production fix applied. Added the smoke harness and machine-derived inventory helper, matrix and this results report. Temporary baseline/final/SLA output files were removed. Final Git status contains only these four intentional test/documentation files; no credentials, tokens, auth exports, fixture uploads, dumps or debug logs are pending commit. No commit was created. **19.2+ was not started.**

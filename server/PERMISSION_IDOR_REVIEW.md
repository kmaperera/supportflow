# Phase 18.12 — Permission / IDOR review

## Outcome and scope

Reviewed all **99 mounted `/api/v1` method/path pairs** before production changes. The complete [permission matrix](PERMISSION_MATRIX.md) records method, path, authentication/roles, resource rules and denial policy. A committed test fixture independently enumerates those routes; automated tests fail if mounted routes and the reviewed inventory diverge.

No missing route-level role gate or cross-user object-access bypass was found in the exercised ordinary-ID workflows. A real identity-precision weakness was found and fixed. No client edits, schema/ID redesign, new roles, permission framework, environment-secret review or audit instrumentation was added.

## Identity fixes

A read-only query using synthetic unsigned BIGINT values `9007199254740992` and `9007199254740993` initially returned the same JavaScript number for both. MySQL identifiers are BIGINT, while services intentionally accept exact decimal strings. Driver rounding could therefore alias identities before ownership comparison.

- `src/config/database.js`: enable `supportBigNumbers: true`, retaining `bigNumberStrings: false`. Large IDs decode as exact strings; ordinary safe IDs retain numbers. Verified against local MySQL after the change.
- `src/middleware/authenticate.js`: fail with 401 if the DB user ID does not exactly match the verified JWT subject. Role and active state continue to come from the current DB row.
- `src/modules/users/user.service.js`: replace `Number(id)` comparisons in self-role/self-deactivation protections with exact string comparisons. Adjacent large IDs no longer falsely count as the same user; actual self-actions remain blocked.

This is an authorization identity fix, not a migration to UUIDs. A synthetic collision was demonstrated; exploitation against existing user accounts was not attempted or claimed.

## Resource review

| Area | Policy and result |
| --- | --- |
| Employee tickets | List/count/search derive creator from the session. Detail, edit, public comment, attachments, close/reopen and feedback enforce ownership. Feedback additionally requires CLOSED. Other-user mutations and reads return 404 before writes. |
| Technician tickets | Queue permits unassigned and own assigned tickets; extra assignment filters narrow that scope. Detail/comments/history/files can be read for unassigned tickets. Public replies, internal notes, uploads, status, priority and resolve require the current assignment. Other technicians' assigned resources return 404. |
| Assignment actions | Self-assignment uses authenticated technician ID and existing unassigned/OPEN checks. Assign/reassign/unassign are Admin-only. Unassign compares the current target ticket's assignment record against `expectedAssignmentId`; stale tokens retain 409. Existing concurrency tests remain passing. |
| Admin tickets | Intentional broad ticket visibility and management; lifecycle rules still apply. Admin is not granted Employee-only creation/edit/feedback endpoints or technician self-assignment. |
| User management | All user listing/creation/profile-field updates/role/status/workload endpoints are Admin-only. There is no generic self-profile mutation endpoint. `/auth/me` and password change use the authenticated identity. Unexpected identity/role fields remain rejected. Self-role changes and self-deactivation retain the existing 400 policy. |
| Categories, SLA | Ticket and KB category management and SLA policy reads/updates are Admin-only. Ticket category/priority active lookups remain available to all authenticated roles. |
| KB | Employee/Technician readers see only PUBLISHED articles in active categories, including list/count/suggestions/detail/feedback. Admin can inspect draft/archived management content. Admin cannot submit article feedback; feedback summaries remain visible where article access permits. No unpublished content is returned on denial. |
| Notifications | List, counts, read-all and individual read updates use session identity. Individual read uses `(id, user_id)` for lookup/update. **No Admin bypass.** The internal `getNotificationById` helper is not exposed as an HTTP route. |
| Attachments | Ticket access, child-to-parent binding and internal-note visibility are checked before provider delivery. Employees cannot fetch internal-note attachments on their own ticket. Delete also requires uploader ownership except the intentional Admin override. Swapped comment/attachment IDs return 404, including for Admin mismatched parents. |
| History | Status and assignment history reuse ticket-detail access. There are no standalone comment update/delete endpoints or client-selected history identities. |
| Dashboard/search/counts | Employee creator scope, Technician assigned scope, Admin global scope; Technician unassigned queue count is intentionally shared. List and total-count queries use the same scope. Query overrides cannot broaden identity scope. |
| Reports/analytics/audit | Reports and CSV/PDF exports, global workload/satisfaction and minimum audit viewer are Admin-only. General dashboard analytics remain role-scoped. |

The existing route middleware handles broad roles; resource services handle ownership, visibility and lifecycle. Admin-only internal management/query helpers rely on their protected route callers; this review does not assert that every exported internal helper independently implements RBAC. No new generic policy engine was needed.

## Socket.IO, stale sessions and frontend

Socket.IO verifies the access token, fetches current user state and joins only `user:<authenticated id>`. It has no client room-join handler. Five real socket clients supplied forged identity/role/room fields and emitted `join`, `joinRoom`, `join:user` and `subscribe`: none could enter another user room. Notifications emitted using server-computed recipient IDs arrived only at the intended socket, including the Admin privacy exception.

Realtime notification payloads are allowlisted. Internal-note notification recipients are checked against trusted assignment/current technician role in existing service code. No client-selectable notification creation API exists.

REST reloads role/active state on every request; a stale ADMIN JWT claim does not grant Admin access, and deactivation blocks the next protected REST call. Refresh uses current state. Existing connected sockets revalidate at connection and disconnect on access-token expiry; they are not forcibly revoked immediately by a later account change. That bounded existing-session behavior remains a known tradeoff (default access TTL 15 minutes), not a new guarantee of immediate socket revocation.

Read-only client inspection confirmed `ProtectedRoute` and role-specific `RoleRoute` wrappers around Employee, Technician and Admin routes. No frontend guard fixes were needed. Browser route manipulation was not manually exercised in this phase; backend tests call APIs directly and do not depend on those guards.

## HTTP error policy and denied side effects

- **401:** missing/invalid authentication, including token-subject/loaded-user mismatch.
- **403:** current role not allowed, inactive account, forced-password-change restriction or Admin article-feedback write.
- **404:** resource absent or outside ownership/assignment/visibility scope; mismatched nested parent/child.
- **409:** valid authorized request conflicts with lifecycle/current assignment.
- **400/422:** existing malformed-input/self-protection conventions remain.

Denied object responses were checked for absent ticket content, internal-note text, filenames, document bytes and Cloudinary URLs/redirects. Negative tests assert no repository writes, transaction commits, provider upload/delete or file delivery. Auth-derived identity and Phase 18.1 body allowlists remain intact.

## Added tests and files

| File | Purpose |
| --- | --- |
| `tests/helpers/permissionMatrix.json` | Explicit reviewed 99-route contract |
| `tests/permissions.routes.test.js` | 211 actual HTTP authentication/role denials, exact mounted-route coverage, stale-role/current-user checks, identity mismatch and Admin self-protection |
| `tests/permissions.idor.test.js` | Five actors; 54 denied object/field swaps, 45 ticket read combinations, 25 notification-owner combinations, KB state and nested-child checks; no writes/file delivery |
| `tests/permissions.socket.test.js` | Five real Socket.IO clients, forged join attempts and recipient isolation |
| `tests/permissions.bigint.mysql.smoke.js` | Read-only real-driver synthetic BIGINT identity regression |
| `tests/permissions.mysql.smoke.js` | Local-only real-MySQL/real-login HTTP smoke, with five disposable users and owned records; scoped cleanup in finally |
| `PERMISSION_MATRIX.md`, `PERMISSION_IDOR_REVIEW.md` | Full matrix, findings, execution evidence and limitations |

The three production files changed are listed under Identity fixes above. Existing attachment/Cloudinary, session, reports/export, KB visibility, notification, dashboard scope and assignment concurrency suites were retained and passed.

## Database-backed direct API execution

No Postman application was available in this session. Equivalent direct HTTP requests were executed against a local Express instance backed by actual MySQL using real login-generated bearer tokens. The smoke refuses production or nonlocal DB configuration, creates only disposable accounts/records and removes only its allocated IDs. Cloudinary boundaries are replaced with fail-fast sentinels to prevent accidental provider operations if a regression appears.

Execution result: **40 checks passed**, zero provider calls, cleanup succeeded.

| Fixture | Actual IDs used during this run |
| --- | --- |
| Employee A / B | 8 / 9 |
| Technician A / B | 10 / 11 |
| Admin | 12 |
| Employee A / B unassigned tickets | 9 / 10 |
| Technician A / B assigned tickets | 11 / 12 |
| Other ticket comment / attachment | 7 / 9 |
| Employee B notification | 43 |
| Draft article | 6 |

These records were removed after verification; do not assume those IDs identify fixtures now. Rerunning the smoke allocates fresh IDs and prints only their IDs/results, never passwords or tokens.

Representative requests actually exercised (use corresponding existing disposable records for a Postman replay):

- Employee A: GET `/api/v1/tickets/9` ? 200; GET/PATCH `/api/v1/tickets/10` ? 404.
- Employee A: POST `/api/v1/tickets/10/comments`, POST `/api/v1/tickets/10/attachments`, PATCH `/api/v1/tickets/10/close` and `/reopen` ? 404.
- Technician A: PATCH `/api/v1/tickets/12/status`, `/priority`, `/resolve`, POST `/api/v1/tickets/12/internal-notes` ? 404.
- Employee/Technician: user role/status updates, category management, SLA policy update, audit logs, CSV/PDF reports and Admin dashboard ? 403.
- Employee A and Admin: PATCH `/api/v1/notifications/43/read` ? 404; notification remained unread in MySQL.
- Employee A: GET `/api/v1/tickets/12/attachments/9/download` ? 404, no delivery.
- Admin mismatched parent: GET `/api/v1/tickets/9/attachments/9/download` and POST `/api/v1/tickets/9/comments/7/attachments` ? 404.
- Draft article 6: Employee/Technician ? 404; Admin ? 200.
- Employee list/search returned only its two fixture tickets and total 2; Technician queue filtered to another technician returned empty rows and total 0.

To repeat from `server/`: `node tests/permissions.mysql.smoke.js` and `node tests/permissions.bigint.mysql.smoke.js`. Requires existing active ticket category/priority and the current local schema. Fixture auto-increment values are consumed normally and are not reset. This is not a production-data test.

## Results and limitations

- `node --test tests/*.test.js`: **351 passed, 0 failed, 1 existing opt-in MySQL historical-attribution test skipped** (352 total).
- New HTTP permission/IDOR suites and real socket suite passed.
- Both real-MySQL smoke scripts passed. The synthetic ID query failed distinctness before the driver change and passed afterward; safe small IDs remain numeric.
- `npm start`: successful MySQL connection and startup on port 5101; stopped after verification.
- `git diff --check`: passed. No backend lint/build script exists. Client unchanged; frontend build/lint was not required.

Tests cover the current matrix and selected concurrency regressions, not proof against every possible race. Technician reads of unassigned tickets/history/internal content are intentional existing policy; assignment is required for writes. Admin notification ownership remains strict. Existing historical public Cloudinary assets still require the migration documented in Phase 18.11; no URL bypass closure is claimed for those remote assets here. No environment-secret protection, audit DB events or Phase 18.13–18.20 work was started.

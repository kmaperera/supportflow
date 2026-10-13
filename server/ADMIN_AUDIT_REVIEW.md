# Phase 18.16 — Important admin actions

Instrumentation reuses the Phase 18.15 trusted `auditService.log()` writer. Business services are the authoritative logging points; controllers provide only a small trusted actor/IP context. There is no second writer or public audit-write endpoint.

## Implemented actions and metadata

| Operation | Action(s) | Entity | Safe metadata |
| --- | --- | --- | --- |
| User creation | USER_CREATED | USER | role, isActive |
| User role change | USER_ROLE_CHANGED | USER | previousRole, newRole |
| User activation/deactivation | USER_ACTIVATED, USER_DEACTIVATED | USER | previousActive, newActive |
| Ticket category creation | CATEGORY_CREATED | CATEGORY | name, isActive |
| Ticket category update | CATEGORY_UPDATED | CATEGORY | changedFields (name/description only) |
| Ticket category status | CATEGORY_ACTIVATED, CATEGORY_DEACTIVATED | CATEGORY | previousActive, newActive |
| Ticket assignment | TICKET_ASSIGNED | TICKET | newTechnicianId, newAssignmentId |
| Ticket reassignment | TICKET_REASSIGNED | TICKET | previous/new technician and assignment IDs |
| Ticket unassignment | TICKET_UNASSIGNED | TICKET | previousTechnicianId, previousAssignmentId |
| Admin ticket priority change | TICKET_PRIORITY_CHANGED | TICKET | previousPriorityId, newPriorityId |
| SLA duration update | SLA_POLICY_UPDATED | SLA_POLICY | changedFields plus previous/new response/resolution minutes, only for changed values |
| KB category creation | KB_CATEGORY_CREATED | KNOWLEDGE_BASE_CATEGORY | name, isActive |
| KB category update | KB_CATEGORY_UPDATED | KNOWLEDGE_BASE_CATEGORY | changedFields (name/description only) |
| KB category status | KB_CATEGORY_ACTIVATED, KB_CATEGORY_DEACTIVATED | KNOWLEDGE_BASE_CATEGORY | previousActive, newActive |
| KB article creation | KB_ARTICLE_CREATED | KNOWLEDGE_BASE_ARTICLE | categoryId, status |
| KB article edit | KB_ARTICLE_UPDATED | KNOWLEDGE_BASE_ARTICLE | changedFields (title/content/categoryId only) |
| KB article publish/unpublish/archive | KB_ARTICLE_PUBLISHED, KB_ARTICLE_UNPUBLISHED, KB_ARTICLE_ARCHIVED | KNOWLEDGE_BASE_ARTICLE | previousStatus, newStatus |

All events reference the actual resource ID. Constants reused existing UPPER_SNAKE_CASE values; new values are `TICKET_PRIORITY_CHANGED`, `KB_CATEGORY_ACTIVATED`, `KB_CATEGORY_DEACTIVATED`, and `KB_ARTICLE_UNPUBLISHED`. Existing reserved security-action constants were not instrumented.

Generic profile edits, report/analytics/dashboard reads, notification reads, ticket lifecycle changes and technician self-assignment are outside this focused admin-control instrumentation. The shared priority workflow emits an audit event only for ADMIN, not for technician-originated changes. SLA active-status mutation has no exposed HTTP controller/route, so this phase instruments the actual duration-update API only.

## Identity, privacy and context

Every affected production controller calls `contextFromRequest(req)` after existing authentication/authorization. It returns only `actorUserId: req.user.id` and `ipAddress: req.ip`. It never reads actor identity from the request body, manually parses forwarded headers, captures headers/cookies, or passes the whole request to a service. User role/status and ticket workflows additionally fix actor identity to their existing trusted current-admin/current-user argument.

Existing service signatures remain compatible by appending optional context after existing optional DB parameters. Internal seeds/tests that have no authenticated context do not invent admin actors or generate fake events; alternate trusted mutation callers must supply the context to obtain auditing. All current affected HTTP mutation paths supply it. Context is separate from business input. No user-agent/request-ID collection was introduced because the schema does not support those fields. Trust-proxy policy was preserved.

Callers construct concise metadata explicitly. Passwords, hashes, temporary passwords, JWTs, request bodies, headers, full user/policy records, ticket descriptions and article bodies are never passed to the writer. Article content changes record the field name, not the content. The existing recursive sanitizer and 16 KiB cap remain in effect. Category names are bounded business labels; user identity is resolved by the existing actor join rather than copied into metadata.

## Ordering, transactions and failures

- User/category/SLA/KB flows with no supplied transaction log after the mutation and successful follow-up reads/required existing side effects. The Phase 18.15 best-effort writer returns NULL and logs only a fixed safe category on insertion failure. Already committed business changes remain successful; no rollback is attempted for them.
- Assignment/reassignment/unassignment and admin priority changes insert the audit entry through their existing transaction connection in strict mode, after successful mutation validation/writes and before commit. Audit-write failure or commit failure rolls back business and audit changes together. Existing notifications/status history retain their original transaction/emit ordering; no notification or email is emitted by the audit writer.
- Category/KB/SLA services that receive an explicit caller-owned DB connection use that same connection in strict mode. The caller owns commit/rollback. No repository/transaction-layer redesign was added.
- Validation, authorization, missing-resource, business-conflict, stale-assignment and mutation failures leave success audit calls unreached. Business exceptions still propagate; audit failures are never recursively audited.

No-op role, category, article, assignment and priority operations produce no change event. Unchanged SLA durations return the existing policy without an update/event. User status requests preserve their previous update/revocation behavior but log only a real boolean state transition. Repairing an already-archived article's stale publication timestamp does not claim a new archive transition. Existing self-deactivation/self-role-change protections and stale `expectedAssignmentId`/409 semantics were preserved.

Before/after comparisons use the services' existing snapshots; nontransactional workflows retain their existing concurrency behavior. Transactional ticket workflows continue to lock the ticket before reading assignment/state snapshots.

## Viewer compatibility

The current viewer previously allowed only demo metadata. Backend `safeMetadata()` and client `safeAuditMetadata()` now allow only the bounded, typed admin fields listed above: known roles/article states, booleans, numeric duration values, decimal resource IDs, bounded category names and a known changed-field list. Unknown fields, arbitrary content and secrets remain hidden; demo metadata is still supported. Invalid legacy metadata remains NULL-safe.

No response shape, endpoint, authorization, filter, pagination, sort order, table design or route was changed. The existing action/entity filters are free-text exact filters, so no static option list needed expansion. Metadata continues to render as React text/JSON rather than HTML. The only endpoint remains authenticated ADMIN-only GET `/api/v1/audit-logs`; no POST/PATCH/DELETE/clear route exists. Audit history remains append-only.

## Verification

- Added five focused tests in `tests/audit.admin.test.js`: user actor/target and secret exclusion; role/status no-ops/conflicts; SLA changed values and best-effort audit failure; assignment/reassignment/unassignment ordering, stale 409, commit rollback and strict audit failure; KB changed fields/state/no-ops; trusted request context and typed read metadata.
- Full backend suite: **367 passed, one skipped, zero failures** (368 tests).
- `node tests/audit.admin.mysql.smoke.js`: local HTTP requests exercised real controllers, authorization, business services, SQL and audit writer on an isolated MySQL connection. An outer transaction with service savepoints verified **24 real inserted audit rows across all 22 action types** above. Exact actors/targets, role metadata, secret/body exclusion, no-ops, stale unassignment 409, both Employee/Technician ADMIN-route denials, action/entity/actor filtering and pagination passed. All fixture users/resources, SLA changes, notifications and audit rows were rolled back. No legitimate history was deleted. AUTO_INCREMENT gaps from rolled-back test inserts are expected. The test deliberately uses synthetic access credentials without invoking deferred login/password-change flows.
- The isolated HTTP smoke emits existing safe realtime-delivery warnings because it does not initialize Socket.IO; it creates no audit-driven notification and does not send email.
- Backend startup/live health: passed, server UP/database UP.
- Client `npm run build`, `npm run lint`, and existing audit API smoke: passed. Client smoke now verifies before/after role fields, BIGINT IDs and exclusion of full article content.
- Headless Chrome `/admin/audit-logs` fixture: passed six widths in light/dark modes, overflow/control/console checks, and an explicit assertion that role before/after metadata is visible. Browser fixture records are mocked; real retrieval was independently verified via the local HTTP/MySQL smoke.
- Backend has no lint script. `git diff --check` passed.

## Files changed

- `src/constants/audit.js`; new `src/modules/audit/audit.admin.js`; `src/modules/audit/audit.service.js`.
- Controllers/services for users, tickets, ticket categories, SLA policies, KB categories and KB articles (six controller/service pairs).
- `client/src/api/auditApi.js` for metadata compatibility only; client audit API smoke and polish browser fixture/checks.
- New `tests/audit.admin.test.js` and `tests/audit.admin.mysql.smoke.js`; adjusted the existing writer read-metadata test to the expanded allowlist.
- This review.

No login, failed-login, logout, password-change, refresh-failure, generic authorization-failure or other Phase 18.17 security-event logging was added. No Phase 18.18 retrieval hardening, Phase 18.19 broad regression framework, or Phase 18.20 final-review implementation was started.

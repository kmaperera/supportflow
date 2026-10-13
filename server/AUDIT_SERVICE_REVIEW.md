# Phase 18.15 — Audit-log repository/service

The Phase 16.19 audit repository already supplied parameterized list/count operations with a shared WHERE builder, stable newest-first ordering, bounded pagination and a LEFT JOIN selecting only actor display fields. Its service supplied UTC retrieval orchestration, the viewer response shape and a demo-only metadata response allowlist. This phase extends those modules with a trusted writer; it does not instrument business/security events or add an endpoint.

## Writer contract

```js
const auditService = require('./audit.service');
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } = require('../../constants/audit');

// Example for later instrumentation, not a call installed in business code:
const result = await auditService.log({
  actorUserId: actorId,
  action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
  entityType: AUDIT_ENTITY_TYPES.USER,
  entityId: affectedUserId,
  metadata: { previousRole: 'EMPLOYEE', newRole: 'TECHNICIAN' },
  ipAddress: trustedIp,
});
```

The accepted fields are `actorUserId`, `action`, `entityType`, `entityId`, `description`, `metadata`, and `ipAddress`. Unknown fields and caller timestamps are rejected. The database generates `created_at`. Success returns `{ id: '…' }`; default-mode failure returns NULL.

Central frozen `AUDIT_ACTIONS`/`AUDIT_ENTITY_TYPES` values use UPPER_SNAKE_CASE and application allowlists. They cover the existing development demo actions and relevant user, assignment, category, SLA, knowledge-base, attachment and authentication events. Adding an action requires a constant change, not a database migration.

Actor/entity IDs accept positive safe integers, BIGINTs or canonical decimal strings up to the MySQL unsigned BIGINT maximum. They become strings without precision loss. Missing/NULL actors represent system/anonymous events, not fake users; missing/NULL entity IDs remain NULL. An entity ID requires an entity type. Descriptions remain plain text, bounded to the existing 1000-character column, and must be deliberately safe summaries.

Phase 18.14 retained no outcome/user-agent/request-ID columns. These fields are not silently accepted or discarded: they are unsupported write fields. `LOGIN_SUCCESS`/`LOGIN_FAILED` actions can express outcomes. No schema changes or correlation infrastructure were introduced.

## Metadata protection

Callers pass a plain structured object, never serialized JSON, a complete request, database record or request body. The sanitizer makes a new object and recursively handles nested plain objects/arrays without modifying the caller. It removes case/punctuation variants of password/password-hash/current/new-password, token/access/refresh token, JWT, authorization, cookies, API keys/secrets, private keys, credentials, session IDs, SMTP_PASS and DB_PASSWORD keys. It drops entire request/body/header/config/env containers and prototype-manipulation keys.

Non-plain objects, HTTP/ORM shapes, recognizable full database-record shapes, accessors, functions, symbols, undefined/non-finite values, BIGINT metadata values, sparse/custom arrays, circular structures and excessive depth/node counts are rejected. Getters and custom `toJSON` are never invoked. Shared non-circular objects are allowed. Depth is limited to eight and visited nodes to 1024. Valid metadata is bounded to **16 KiB of serialized UTF-8 JSON**, including escaping; oversize data is rejected, never truncated into invalid JSON. Empty sanitized objects become SQL NULL. Plain strings remain plain, without HTML encoding.

These defenses cannot determine whether an otherwise ordinary plain object came from `req.body`, or recognize a credential deliberately placed under an innocuous key such as `reason`. Future trusted callers must construct minimal safe context explicitly, avoiding complete records, article/ticket bodies, file contents, secrets and raw errors. No generic request/body capture was implemented.

The repository serializes the sanitized object as JSON and executes one fixed-column `INSERT INTO audit_logs (...) VALUES (?, …)` using seven mysql2 placeholders. It returns the insert identity and permits a caller-owned database connection. Raw repository errors reach the service, which replaces them with safe audit-specific failure categories. There are no update/delete methods.

## Context and failure policy

`ipAddress` accepts a bounded valid IPv4/IPv6 string (including Express IPv4-mapped IPv6 addresses) and trims surrounding whitespace. It rejects forwarded-address lists and scoped addresses. Later callers should pass Express-derived `req.ip`; the writer does not read `X-Forwarded-For`, headers or request objects. Trust-proxy settings were unchanged. No user-agent collection, email or Socket.IO emission was added.

Default writes are best effort: call them **after successful business mutation/commit**. Invalid entries and insert failures return NULL and log a fixed category only, without action input, metadata, SQL, bound values, SDK errors or credentials. Failures are not audited recursively.

For atomic transactional auditing, explicitly use:

```js
await auditService.log(entry, { connection, strict: true });
```

Strict mode throws a fresh safe error with `AUDIT_INVALID_ENTRY` or `AUDIT_WRITE_FAILED`, without attaching the underlying DB error. The caller owns begin/commit/rollback/release. The service never commits or rolls back someone else's transaction. Transactional callers should use strict mode if an audit failure must roll back their business mutation; choosing default mode deliberately allows that mutation to proceed. Future security instrumentation can choose its failure policy without changing this writer.

## Retrieval compatibility

List/count SQL, WHERE builder, filter parameters, search columns, selected actor fields, ordering, pagination, controller, route and response shape were retained. Read metadata now also goes through the bounded defensive sanitizer before the existing demo-only response allowlist. Parsed MySQL JSON and JSON strings are supported; malformed/empty/unsupported legacy metadata returns NULL without changing stored rows or failing the whole viewer. Additional legitimate write metadata is stored but remains hidden from the current viewer until a later deliberate read-side allowlist change. This preserves the existing Admin UI contract.

The only audit endpoint remains authenticated ADMIN-only GET `/api/v1/audit-logs`. No POST/edit/delete/clear endpoint, duplicate API/table, event instrumentation, retention process or frontend redesign was added. Audit history remains append-only application data.

## Files and verification

Changed/added files:

- `src/constants/audit.js`: action/entity allowlists.
- `src/modules/audit/audit.metadata.js`: recursive sanitizer and size bounds.
- `src/modules/audit/audit.repository.js`: parameterized append-only create operation.
- `src/modules/audit/audit.service.js`: entry validation, best-effort/strict writer and defensive read sanitization.
- `tests/audit.write.test.js`: eight focused writer/sanitizer/failure/retrieval tests with fake values.
- `tests/audit.write.mysql.smoke.js`: explicitly invoked live transactional write verification.
- This review.

Verification results:

- Full backend suite: **362 passed, one skipped, zero failures** (363 tests). Final focused writer and existing audit retrieval tests also passed after adding plain request/record-shape rejection cases.
- `node tests/audit.write.mysql.smoke.js`: live insert, valid JSON, recursive secret removal, NULL actor/entity IDs, IPv6 and DB-generated timestamp passed. Test insertion was rolled back; no fake audit row remains. Like any rolled-back AUTO_INCREMENT insert, the test can leave an unused ID gap.
- `node tests/audit.schema.mysql.smoke.js`: existing schema/indexes/FK and retrieval/filter compatibility passed; the original three rows remain intact.
- Backend startup/live health: passed, server UP/database UP.
- Existing client `auditLogs.smoke.mjs`: API/filter/pagination/safe metadata/empty-result regression passed.
- Existing headless Chrome polish fixture for `/admin/audit-logs`: passed six widths in light/dark themes, including render, overflow, control and console checks. Browser records are mocked; old-row retrieval was checked separately against live MySQL.
- Backend has no lint script; no frontend compatibility changes were required, so frontend build/lint were not required for this phase. `git diff --check` passed.

No Phase 18.16–18.20 implementation or automatic audit event writing was started.

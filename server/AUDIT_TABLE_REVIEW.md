# Phase 18.14 — Audit logs table

## Existing implementation and migration decision

Phase 16.19 already created `audit_logs` in `database/migrations/020_create_audit_logs_table.sql`, a development demo seed, and the repository/service/controller/validation/GET route consumed by `/admin/audit-logs`. The repository supports search, action, actor, entity type/ID, UTC date ranges and pagination. It orders by `created_at DESC, id DESC` and binds filter/pagination values. IDs are returned as strings to preserve BIGINT precision. The service allows only safe demo metadata in current responses.

The migration and live development schema already satisfy Phase 18.14. No old migration was edited, no new ALTER migration is necessary, and no second table was created. The existing idempotent migration was replayed against the current table to verify compatibility. Before/after rows were compared in memory without printing their contents; all three rows were preserved.

## Final schema (unchanged from the existing schema)

| Column | Type | Null/default | Purpose |
| --- | --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key, AUTO_INCREMENT | Stable event identity |
| actor_user_id | BIGINT UNSIGNED | Nullable | Authenticated actor, when known |
| action | VARCHAR(100) | Required | Stable machine-readable action |
| entity_type | VARCHAR(100) | Nullable | Polymorphic resource type |
| entity_id | BIGINT UNSIGNED | Nullable | Resource identity, when applicable |
| description | VARCHAR(1000) | Nullable | Existing viewer-compatible bounded summary |
| metadata | JSON | Nullable | Structured, sanitized context |
| ip_address | VARCHAR(45) | Nullable | Reserved for later security events; supports IPv4/IPv6 |
| created_at | TIMESTAMP | Required, CURRENT_TIMESTAMP | Database event timestamp |

No `updated_at` is needed for append-only events. MySQL TIMESTAMP stores instants with session-time-zone conversion; existing retrieval sets its session to UTC before filtering/formatting and restores it afterward. Future writers must use database timestamps rather than browser-local timestamps. Table collation is `utf8mb4_unicode_ci`, matching `users`; it was not changed.

## Indexes and foreign key

All existing indexes were verified and retained; none were added:

- PRIMARY (`id`).
- `idx_audit_created` (`created_at`, `id`) supports chronological pagination and deterministic timestamp ties.
- `idx_audit_actor_created` (`actor_user_id`, `created_at`, `id`) supports actor/date filters.
- `idx_audit_action_created` (`action`, `created_at`, `id`) supports action/date filters.
- `idx_audit_entity_created` (`entity_type`, `entity_id`, `created_at`, `id`) supports resource history.

No arbitrary JSON index, partitioning or redundant standalone indexes were added. Leading-wildcard search remains the existing bounded viewer search; it is not a justification for adding every possible index combination. Entity-ID-only queries can still require a scan because entity type is the leading resource-index column.

`fk_audit_actor` references `users(id)` with `ON DELETE SET NULL` and `ON UPDATE NO ACTION`. Nullable actors permit system/security events without fake user IDs. User deactivation preserves the actor reference; deletion preserves the event with no recorded actor. That deliberate FK nullification is an exception to application append-only semantics. No polymorphic entity FKs are used, so resource deletion cannot cascade-delete history.

## Event and metadata contract for later phases

Use UPPER_SNAKE_CASE action/entity names, such as `USER_ROLE_CHANGED`, `LOGIN_FAILED`, `USER`, `TICKET`, `AUTH`, and `SLA_POLICY`. VARCHAR columns allow new actions without schema migrations; no ENUM or new application constant framework was introduced. Unknown/system actors use SQL NULL; events without one business resource use NULL entity IDs, never a fake zero. System actions may use entity type `SYSTEM` when applicable.

Metadata is structured JSON, not rendered HTML or a serialized complete request/user record. Future writers must accept explicitly sanitized context with bounded serialized size: IDs, changed field names and safe reason codes. Never include passwords/hashes, JWTs, refresh tokens, authorization/cookie headers, environment secrets, raw stack traces, file buffers, private storage credentials or full ticket/article bodies. JSON typing guarantees valid JSON, not secret removal or a small payload; enforcing a metadata size limit and writer allowlists belongs to Phase 18.15. Existing read-side metadata allowlists remain unchanged.

The existing nullable IP column is retained for the planned Phase 18.17 security events; this phase collects no new IP data. User-agent collection has no current consumer, so no column was added. No request-ID infrastructure exists, so no request-ID column or middleware was added. No separate outcome column is necessary now: future success/failure actions can be explicit (`LOGIN_SUCCESS`/`LOGIN_FAILED`), with safe codes in metadata when required. Reassess optional context fields only when a writer has a concrete need.

Audit entries remain server-owned, append-only application history rather than a full request log. Current retrieval is authenticated ADMIN-only GET `/api/v1/audit-logs`; no write, edit, delete or clear route exists. There are no new mutation routes, event-writing calls, retention jobs or repository redesigns. Production-scale retention may need a policy later; no automatic history deletion is implemented.

The development seed requires `NODE_ENV=development`, labels illustrative records with `[DEMO]` and `isDemo`, uses NULL actors and contains no credentials. Existing legitimate/demo rows were neither deleted nor reseeded.

## Verification and changed files

Added `tests/audit.schema.mysql.smoke.js`, a focused explicitly invoked local DB check. From `server/`, run:

```sh
node tests/audit.schema.mysql.smoke.js --verify-migration
```

Without the flag it only inspects schema and reads rows. With the flag it replays migration 020's idempotent CREATE against an already-existing table; it does not apply every project migration. It verifies columns/nullability/defaults, chronological/filter indexes, actor FK, unchanged existing rows, live service pagination and action/actor/entity/date/search query execution. Existing demo rows have NULL actor/entity references, so positive actor/entity matches remain covered by the existing isolated HTTP/query tests; live checks exercise those filters with empty results.

Results:

- `DESCRIBE audit_logs` and `SHOW INDEX FROM audit_logs`: match the intended existing schema; FK and collation inspected and confirmed.
- Migration replay/live schema smoke: passed; all three old rows preserved and retrievable.
- Existing audit tests: both passed, including unauthenticated denial, EMPLOYEE/TECHNICIAN denial, ADMIN retrieval, metadata sanitization and pagination/filter contracts.
- Full backend suite: 354 passed, one skipped, zero failures (355 tests).
- Backend startup and live health: passed, server UP/database UP; no schema mismatch.
- Existing client audit API smoke: passed for filter allowlisting, dates, pagination, safe metadata and empty results.
- Headless Chrome: `/admin/audit-logs` rendered through the existing safe polish fixture and passed six widths in light/dark themes, overflow/control/console checks. This uses mocked browser records, not a real administrator login; old-row retrieval was independently verified against MySQL.
- Backend has no lint script. No client compatibility/source changes were needed, so client build/lint were not required for this phase.

Only this review and `tests/audit.schema.mysql.smoke.js` were added. Migration 020, all production repositories/services/routes, seeds, and the frontend were retained. No Phase 18.15–18.20 implementation was added, no event instrumentation was added, and no duplicate table/API was created.

# Phase 18.18 — Audit-log retrieval API

The existing Phase 16.19 endpoint remains **GET `/api/v1/audit-logs`**, consumed by `/admin/audit-logs`. Its route, controller and response envelope were retained. No parallel endpoint, record-by-ID, write/edit/delete/clear route, export, Socket.IO event or retrieval-audits-itself behavior was added.

## Protection and query contract

Middleware order remains authentication → ADMIN authorization → audit query validation → shared validation middleware → controller/service. Validation cannot cause a data query before authorization. Missing credentials return 401; authenticated Employee/Technician callers return 403, even when their query is malformed.

Supported fields:

| Query | Behavior |
| --- | --- |
| page | Default 1; positive safe integer; computed offset and offset + limit must remain safe integers |
| limit | Default 25, matching the current frontend; explicit range 1–100 |
| search | Trimmed, at most 200 characters; whitespace-only omitted; literal search over action/description only |
| action | Trimmed exact value from existing AUDIT_ACTIONS, including all Phase 18.16/18.17 events and old demo actions |
| actorUserId | Optional canonical positive unsigned BIGINT decimal identity; safe numbers or strings; no precision-losing numbers |
| entityType | Trimmed exact value from existing AUDIT_ENTITY_TYPES |
| entityId | Same positive unsigned BIGINT validation as actor ID |
| startDate | Real YYYY-MM-DD calendar date, interpreted as UTC midnight inclusive |
| endDate | Real YYYY-MM-DD date, interpreted through next UTC midnight exclusive, including the whole selected day |

Start must not follow end. Shared calendar validation rejects impossible dates, non-date-only values and end boundaries beyond the supported year range. Duplicate/array/object query values, NULL pagination values, oversized limits/search, invalid IDs/constants and unsupported keys return **400** with the normal `{ success: false, message: 'Invalid audit-log query', errors: [] }` envelope. No submitted values are echoed. This is audit-route-local behavior; other APIs retain their existing 422 validation status.

No outcome column/filter exists in this schema. Sort/order were not existing frontend controls, so these query fields remain unsupported rather than introducing unused functionality. Ordering is fixed to `created_at DESC, id DESC`; there is no user-controlled ORDER BY interpolation. Valid empty/out-of-range result pages return 200 with empty logs and consistent pagination, never 404.

## SQL, timestamps and response minimization

The repository retains its shared list/count WHERE builder, binding all filter values and LIMIT/OFFSET. Search escapes LIKE wildcard characters (`%`, `_`, `!`) using the established escape character, so SQL-looking text is literal data. Count and list use exactly the same predicates/values; the list has an additional fixed metadata-size parameter and pagination parameters.

The existing actor LEFT JOIN preserves anonymous/unavailable-actor rows. Selected user fields remain only first_name, last_name, email and role; no users wildcard, password hash or unrelated profile fields is selected. Returned IDs remain strings to preserve unsigned BIGINT precision. UTC retrieval session setting/restoration is unchanged, and dates/timestamps remain independent of browser-local time.

The envelope remains `{ success: true, message, data: { logs, pagination } }`. Each log retains id, actor (or NULL), action, entityType, entityId, description, safe structured metadata, ipAddress and createdAt. Pagination remains page, limit, total, totalPages, hasNextPage and hasPreviousPage. IP is intentionally retained for the authenticated Admin security viewer; Employee/Technician callers receive no audit data. There is no user-agent/header/config field.

New metadata minimization:

- The SELECT suppresses legacy JSON exceeding 16 KiB of serialized UTF-8 bytes **before returning it from MySQL**, using a bound cap and CASE expression. Such metadata becomes NULL without modifying its row.
- String metadata is size-checked before JSON parsing in the service. Malformed/empty/unsupported legacy metadata remains NULL-safe and does not fail the whole page.
- The existing recursive sanitizer and bounded typed read allowlist remain active. Passwords/hashes, tokens, authorization/cookies, API secrets and unknown credential-bearing metadata fields are not returned. Tests include fake restricted legacy fields and full raw-row fields to verify they do not escape response mapping.
- Plain data stays plain JSON/text; no pre-rendered HTML or HTML encoding was introduced. Existing React text/pre rendering remains safe.

The 100-record maximum, existing bounded description/user fields and metadata minimization bound response size. Existing action/actor/entity/date/chronological indexes were retained. There is no metadata wildcard search or new index bloat. Existing leading-wildcard action/description search can require scanning matching candidates; no claim of index-only arbitrary substring search is made. Live queries had no observed issue requiring EXPLAIN or speculative indexing changes.

## Cache and frontend compatibility

Existing Phase 18.4 sensitive-route policy already sets `Cache-Control: private, no-store` for audit success/errors/denials; this was verified and retained. No global cache change, new ETag scheme or separate limiter was added. The existing general API rate limiter remains sufficient.

The viewer uses exact free-text action/entity filters and explicit Apply/Clear controls, not outdated static dropdowns or per-keystroke search requests. No layout, loading skeleton, shared pagination, metadata UI, theme, debounce behavior or Clear Filters styling was changed. One safe public error-message allowlist entry (`Invalid audit-log query`) makes the hardened 400 query rejection readable; arbitrary server error text remains hidden.

All existing legacy rows can still be listed/searched. Unknown historical action/entity values can remain visible without being mutated; exact filters now accept only current constants, while search remains literal action/description text.

## Tests and results

- Existing `tests/audit.test.js` expanded with audit-specific 400/default/scalar/date/constant tests; role/authorization-before-validation and no-store checks; bound literal search and list/count consistency; BIGINT/NULL actor handling; bounded/invalid/secret-bearing legacy metadata; predictable response minimization and empty pagination.
- Existing cross-endpoint input-validation test updated only its audit-specific status/error-list expectations. Other endpoint validation contracts are unchanged.
- New `node tests/audit.retrieval.mysql.smoke.js`: actual local Admin/Employee/Technician logins and HTTP/MySQL retrieval verified 200/403/401/400, no-store, eight rows sharing a timestamp across pages of five/three with no overlap, actor/action/entity/date/search combinations, inclusive UTC date bounds, empty results, literal SQL-looking search, NULL actor rows, restricted legacy metadata and oversized JSON suppression. Retrieval caused no audit-row growth. All fixture users/login sessions/audit rows were rolled back; existing history was not deleted. AUTO_INCREMENT gaps from rollback are expected.
- Existing Phase 18.17 live security audit smoke passed against the hardened retrieval API; its fixtures were also rolled back.
- Full backend suite: **379 passed, one skipped, zero failures** (380 tests). Backend has no lint script or generic npm test script; suite ran directly with Node.
- Backend startup/live health passed: server UP/database UP. Schema/index/FK/live retrieval smoke passed with the original three rows intact.
- Existing client audit contract smoke passed.
- New focused `client/tests/auditRetrieval.cdp.mjs` uses the existing safe browser fixture to verify initial load, action filter submission, shared pagination, empty/error states, Clear Filters recovery and structured metadata. Actual backend behavior was checked separately against MySQL.
- Existing headless Chrome polish checks for `/admin/audit-logs` passed six widths in light/dark modes, metadata visibility, overflow/control/console checks.
- Client build and lint passed; build retains its existing large-chunk warning. `git diff --check` passed.

## Files changed

- `src/modules/audit/audit.validation.js`: constant/scalar validation and route-local 400 handling.
- `src/modules/audit/audit.repository.js`: SQL metadata-size minimization.
- `src/modules/audit/audit.service.js`: pre-parse metadata size check.
- `tests/audit.test.js`, `tests/inputValidation.test.js`, `tests/audit.schema.mysql.smoke.js`: expectations and focused coverage.
- New `tests/audit.retrieval.mysql.smoke.js`.
- `client/src/api/apiError.js`: one public error-message compatibility entry.
- New `client/tests/auditRetrieval.cdp.mjs`.
- This review.

No duplicate endpoint or audit mutation route was created. No Phase 18.19 broad security-regression framework or Phase 18.20 final security-review work was started.

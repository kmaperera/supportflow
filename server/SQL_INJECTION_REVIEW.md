# Phase 18.2 - SQL-injection protection review

## Outcome and scope

Reviewed **149 SQL execution call sites** across runtime source, repositories, seeds and diagnostics: [statement inventory](SQL_QUERY_INVENTORY.md). No unsafe interpolation of request data into SQL text was found. Existing data placeholders and repository-level identifier mappings were retained. This is an audit result for the reviewed code, not a guarantee against future changes.

The small production changes make `multipleStatements: false` explicit and add scalar/bounded pagination checks to three repositories that previously relied on service validation. No API contracts, frontend files, SQL business predicates, report calculations, transactions or search semantics changed.

## Files changed

- `src/config/database.js`: explicitly disable multiple statements (already disabled by driver default).
- `src/utils/sqlPagination.js`: new repository pagination guard: safe integer limit 1-100, nonnegative safe offset and safe offset-plus-limit.
- `src/modules/knowledgeBase/knowledgeBaseArticle.repository.js`, `src/modules/notifications/notification.repository.js`, `src/modules/audit/audit.repository.js`: use the guard before executing list queries. LIMIT/OFFSET remain placeholders.
- `tests/sqlInjection.test.js`: focused repository and mounted-API regression tests, using the existing Node test framework.
- `tests/sqlInjection.mysql.smoke.mjs`: read-only verification of actual MySQL driver binding and disabled multi-statements.
- This report and `SQL_QUERY_INVENTORY.md`.

## Module audit

Each function/call site is listed in the inventory, linking to the SQL statement and values array. The following records input origin and dynamic-fragment reasoning for those statements.

| Module | Data passed through placeholders | Dynamic SQL review/result |
|---|---|---|
| Auth / refresh tokens | Login email, user IDs, password/token hashes, expiry dates, token IDs | User and refresh-token repositories use fixed statements or constant projections; no token/email interpolation. Expired-token cleanup is static SQL. |
| Users | IDs, names, email, profile values, role/active filters, search patterns, limit/offset | Sort columns and ASC/DESC checked inside repository. Update keys map through `PROFILE_COLUMNS` with own-property checks; unknown/prototype keys rejected. Search WHERE branches use literal SQL. |
| Tickets | Ticket/requester/assignee/category/priority IDs, titles, descriptions, status, resolution text, deadlines, search/date filters | Ticket sort identifiers map through `TICKET_SORT_COLUMNS`; direction constrained in repository. Queue defaults are fixed expressions. WHERE conditions come from fixed branches, not client fragments. Employee-update columns use a strict mapping. |
| Assignment/history | Ticket/technician/actor IDs, assignment type and status history values | Fixed INSERT/UPDATE/lookups and fixed history order. Assignment concurrency checks retain the existing transaction/service path. |
| Comments/notes | Author/ticket/comment IDs, type, complete content | Constant projection and optional fixed PUBLIC filter; content always data. |
| Attachments | IDs, filename, cloud public ID/URL, MIME/resource type, size, uploader | Fixed statements. Optional visibility clause is a fixed branch; filename and cloud metadata never become SQL. |
| Ticket categories | Name, nullable description, creator/category ID, active state | Constant projections and fixed assignments/order. |
| Notifications | Recipient/related IDs, type/title/message, dedupe key, pagination | Fixed unread-state fragment. Batch creation performs individual bound INSERTs, not a raw joined IN list. Added direct-call pagination guard. |
| SLA | Policy/priority/ticket IDs, minute targets, deadlines and active state | Fixed policy/deadline SQL. SLA warning service creates bound notification data inside transactions; no independent raw-query scheduler or auction subsystem found. Calculation modules do not execute SQL. |
| KB categories/articles | Category/author/article IDs, title/content/slug/state/date, search terms and limits | Visibility branches are literal fragments. Suggestions build a score from fixed CASE expressions, with at most eight terms; each term binds twice. List pagination now checked in repository. State and view-count updates are fixed SQL. |
| KB/ticket feedback | Resource/user IDs, rating/helpful value, comments | Fixed INSERT/UPDATE/summary SQL; no content interpolation. |
| Dashboard/analytics | Role-scoped owner IDs, date boundaries, result limits | Period is restricted to daily/monthly and selects one of two fixed DATE_FORMAT strings. Activity source has an own-property checked map of table/time/actor/projection fragments. Aggregate column names come from literal response/resolution arrays. No client-selected GROUP BY expression. |
| Reports / CSV / PDF | Filter IDs/status/dates, search patterns, pagination | Sort column Map and ASC/DESC guard are in repository. Historical/completion kind selects fixed tables, columns, event SQL and MIN/MAX. Other groupings are fixed. CSV/PDF reuse safe repository/service data; there is no raw export query interface. |
| Audit retrieval | Search/action/actor/entity/date values, limit/offset | Fixed filter-column pairs and ordering. Added direct-call pagination guard. Session timezone restoration uses a placeholder; setting UTC and reading the old zone are fixed statements. |
| Health / connection checks | None | Fixed SELECT 1. |
| Seeds 001-005 | Environment-supplied admin identity/hash and seed values | Values bind, including audit description/JSON; transaction statements are static. Seeds were inspected, not executed. |
| Dashboard EXPLAIN diagnostic | Repository parameter arrays | SHOW INDEX iterates a source-defined table list. Local EXPLAIN callback prefixes repository-generated SQL only; no CLI/request SQL argument exists. Not exposed through an API. |
| Migrations | None at runtime | Static SQL files; no request interpolation or dynamic stored-procedure invocation found. Not executed. |

### Specific SQL construction findings

- **Parameterization:** user data uses positional `?` placeholders in both `query` and `execute`. The review distinguishes bound text-protocol queries from prepared `execute` calls; both were checked against the installed driver and current database. No blanket migration to prepared statements or ORM was needed.
- **ORDER BY / GROUP BY:** existing repository checks remain authoritative even if an internal caller bypasses route validation. Tests reject injected identifiers/directions and `__proto__`, `constructor`, `toString` map keys before SQL execution.
- **LIMIT/OFFSET:** values remain bound. Existing ticket/user/report bounds remain; KB/notification/audit now have equivalent direct-call checks. Recent dashboard/suggestion limits already have smaller explicit bounds. Report exports retain their existing no-pagination behavior.
- **IN clauses:** found only static enum lists or a fixed count of placeholders for server-defined statuses. No raw client-ID array is joined into SQL. The variable-length KB suggestion score already has an eight-term bound and contains only application SQL plus bound terms.
- **Dynamic updates:** user profile and employee ticket edits reject unknown keys and map known keys to literal columns. Other mutations enumerate columns explicitly.
- **Dynamic tables/columns:** activity and report kinds select fixed mappings/branches. The internal ticket list helper accepts WHERE text only from private filter builders and is not exported. Report builders accept known filter objects, not raw SQL. No runtime API for `rawWhere`, `rawOrder`, `rawColumns`, arbitrary tables or stored procedures was found.
- **No fake sanitization:** no quote/semicolon/SQL-keyword blacklist, manual SQL escaping, `escapeId` substitution or double-escaping was added.
- **LIKE semantics preserved:** ticket/user/KB searches allow `%` and `_` wildcards as before, but the entire pattern is bound. Reports/audit already treat `%`, `_` and `!` literally with `ESCAPE '!'`; their existing escaping remains. A wildcard-only search may intentionally match many rows and is not evidence of predicate injection.
- **Configuration:** the one shared runtime pool now explicitly sets `multipleStatements: false`; seeds use that pool too. Current MySQL SQL mode was verified compatible with mysql2 text-query escaping (no `NO_BACKSLASH_ESCAPES`). The read-only smoke script fails if that prerequisite changes. No server/session SQL mode was changed.
- **Errors:** injected identifier values fail validation or repository guards. A simulated database syntax error returned only `{ success: false, message: "Internal server error", errors: [] }`; SQL/table/schema details were not exposed. Existing error handling was unchanged.

## Tests and startup

- `node --test tests/sqlInjection.test.js`: **5 passed**. Search payloads leave SQL text unchanged while appearing in the values array. Tests cover direct repositories, valid sort/group paths, invalid identifiers, updates, transaction-injected DB handles, pagination and suggestion bounds. API tests use real routes/controllers/services with an isolated test identity and mocked database; they are not a live-data authorization test.
- Payloads: single/double quote, `%'`, `admin' OR '1'='1`, `1 OR 1=1`, and `test'); SELECT 1; --`. Malicious sorts, dates and IDs are rejected; accepted searches remain bound. Login injection receives validation/auth failure.
- `node tests/sqlInjection.mysql.smoke.mjs`: **passed** against configured MySQL. Both query/execute round-tripped seven payloads (including a backslash/quote case), and an equality predicate stayed false. Harmless `SELECT 1; SELECT 2` was blocked. No application rows were read or modified.
- `node --test tests/*.test.js`: **322 passed, 0 failed, 1 skipped** (323 tests). The skip is the existing conditional MySQL historical-attribution test. Existing assignment/comments/notifications/KB/analytics/reports/export suites remain green.
- `npm start`: succeeded on temporary port 5092; MySQL connection successful. Live health returned 200 and injection-shaped login returned 422. Temporary server stopped after verification.
- No backend build/lint scripts are defined. Frontend build not required because no client files or API contracts changed. Syntax and diff checks passed.

## Postman checks

Use `http://localhost:5000/api/v1`, an appropriate test account and an existing ID in place of illustrative **1**. URL-encode query payloads. Use disposable test data for any normal workflow mutation; the automated SQL tests do not change real application data.

| Request | Input | Expected |
|---|---|---|
| POST /auth/login | email `admin' OR '1'='1@example.com`, arbitrary password | 422 validation or 401 credentials failure; no login bypass |
| GET /users, /tickets/my, /tickets/queue, /knowledge-base/articles | search `' OR '1'='1` | Normal search response; pattern remains data, predicate unchanged |
| GET /users | sortBy `created_at DESC; SELECT 1` | 422 |
| GET /reports/tickets | sortOrder `DESC; DROP` | 422; no statement executed |
| GET /tickets/1%20OR%201=1 | malformed ticket ID | 422 before repository access |
| GET /reports/tickets | categoryId/technicianId `1 OR 1=1`; malformed date | 422 |
| GET /dashboard/ticket-trend | period `monthly; SELECT 1` | 422 |
| GET /audit-logs | search `test'); SELECT 1; --` | Normal search result; no SQL interpretation |
| GET /reports/tickets/export/csv | search containing `%_!` and apostrophe | Existing literal-wildcard search/export behavior |

Also verify ordinary login, search/filter/sort, assignment, comments, notification reads, KB, analytics, reports and exports using current frontend request shapes. Automated existing regression suites cover these contracts; no live business mutation was performed for this audit.

## Deferred scope

No discovered SQL interpolation issue was deferred. Broader XSS, permissions/IDOR, rate limiting, headers, cookies/CORS/JWT, file-security, secrets and new audit features remain their later phases. No ORM, migration, authorization redesign or new dependency was added. Deployment SQL-mode changes require rerunning the driver smoke test; it verifies the active configuration rather than silently changing database settings.

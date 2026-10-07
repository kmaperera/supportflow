# Phase 18.1 - Input-validation review

Reviewed all **99 mounted method/path pairs** under `/api/v1`, including older routes. See [the complete route inventory](INPUT_VALIDATION_ROUTES.md). Only server files changed; client API helpers were inspected for compatibility. No dependencies or database migrations were added.

## Findings and implementation

- Added boundary validation to user listing, KB article listing and KB suggestions, where validation previously lived only in services. User listing now rejects excessive limits instead of silently clamping them, caps search at 200 characters and department at its existing 150-character capacity, rejects duplicate/structured query values, and shares the service's sort allowlist.
- Added shared object-field allowlists, exact positive-ID validation and bounded pagination helpers. Ticket and notification pagination reject unsafe computed offsets before controller work. Existing report/audit safe-offset guards remain.
- User creation, role/status changes, ticket assignment/unassignment and self-assignment now reject unexpected body fields. KB publish/unpublish/archive require an empty body. These action routes still derive transitions from the route, not submitted state.
- Added password input maximum of 1024 characters to login, user creation and all password-change fields as a resource bound. The existing minimum-eight/uppercase/lowercase/digit creation/change policy remains. Passwords are not trimmed or otherwise normalized; bcrypt/session policy was not changed. Login email is capped at the existing 255-character column size.
- Ticket date filters reuse the existing strict calendar-date parser (including the supported year range). Whitespace-only audit search is treated as absent, consistent with other search endpoints. Punctuation and inner spaces/newlines are preserved.
- KB content validates the existing MySQL TEXT byte capacity (65535 UTF-8 bytes); suggestions cap description at the existing ticket-description limit of 5000 characters.
- Multipart uploads accept the existing `attachment` file only. Extra text fields and query filters are rejected; ticket/comment IDs come from validated params and uploader identity from auth. MIME handling, signatures, storage and Cloudinary policy were not changed.
- Profile update persistence now builds an explicit mapping of the existing editable fields rather than copying the submitted object after its allowlist check. No exploitable unrestricted persistence spread was found: ticket/category/KB services already validate keys or construct explicit persistence objects. Other reviewed spreads follow allowlist checks or involve internal data.
- Malformed JSON returns a safe 400 and oversized parser payloads return a safe 413 using the existing response envelope; submitted JSON fragments are not echoed. Express-validator failures continue using the shared 422 convention and `{ success: false, message, errors }`, excluding raw values and stack traces.

## Request contracts and service assumptions

All route IDs are positive integers, rejecting zero, negatives, fractions, malformed strings and overflow. BIGINT-capable endpoints retain exact decimal strings through validation up to unsigned BIGINT maximum; unsafe numeric JSON values are rejected. KB body category IDs and report numeric filters retain their existing JS-safe integer contracts. There are no free-form SQL sort/group expressions accepted.

| Module/routes | Accepted input and boundary rules | Controller/service responsibility retained |
|---|---|---|
| Health, auth `/me` | No user body/query values consumed | Existing health/authenticated identity response |
| Auth login/change | Login: email/password. Change: currentPassword/newPassword/confirmPassword. Strings and existing policy; new input caps | Generic invalid credentials, confirmation match, current-password verification, different-password rule, token revocation |
| Auth refresh/logout/logout-all | Existing refresh cookie only; empty body/query, no new required fields | Cookie/token validation and revocation remain unchanged |
| Users create/update | Create: firstName, lastName, email, password, role; optional phone/department/profileImageUrl. Update: only those profile fields, excluding password/role; at least one | Email uniqueness; password hashing; server-derived initial account flags |
| Users listing | page/limit; search/department; role; isActive true/false/1/0; sortBy from shared userQuery constants; order ASC/DESC (case-insensitive) | Explicit filters and mappings; no client owner identity |
| Users technician/workload lookups | search only, trimmed, max 100 | Server-scoped eligible technicians/workload |
| Users role/status | Role from USER_ROLES; actual boolean isActive; no unrelated body fields | Self/protected-account rules and token revocation |
| Tickets create/update | categoryId, priorityId, title 5-200, description 10-5000; update requires at least one field | Employee identity from req.user; existing category/priority lookup, ownership and editable-state checks |
| Ticket my/assigned/queue lists | page/limit (max 100), search max 200, status, categoryId, priorityId, fromDate/toDate, sortBy/order. Queue additionally assignedTo and assignment=assigned/unassigned/mine; assigned list restricts workload statuses | Existing role scoping. Ticket statuses and sorts use shared backend constants |
| Ticket assignment | Admin assign: technicianId. Unassign: required expectedAssignmentId. Self-assign: empty body | Auth-derived actor/self technician; stale token remains 409; no new concurrency token added to assign |
| Status/priority/resolve/close/reopen | Working status only IN_PROGRESS/WAITING_FOR_USER; priorityId is an ID, not a priority-name string; resolutionSummary 10-5000; close/reopen empty body | State transitions, supported priority lookup (LOW/MEDIUM/HIGH/CRITICAL), SLA recalculation and ownership remain service logic |
| Ticket comments/notes | content string 1-5000 after trim; no author/visibility fields | Actor from req.user; PUBLIC/INTERNAL determined by route; visibility checks unchanged |
| Ticket attachments | Valid ticket/comment/attachment params; one attachment file; no text metadata or upload/list/download query values | Existing file checks, resource ownership, cloud upload/download/delete behavior |
| Ticket detail/history/workflow/lookups | Validated IDs where present; no other consumed client input | Existing visibility, role scoping and server lookups |
| Ticket feedback | ticketId; integer rating 1-5; optional comment max 1000, not null; query/extra body fields rejected | Actor from auth, ticket eligibility and uniqueness retained |
| Ticket categories | name 1-100; optional nullable description max 255; update at least one; status actual boolean isActive | Uniqueness, actor and existing references remain service/DB concerns; lists have no supported filters |
| KB categories | Separate contract: name 2-100, nullable description max 255; update at least one; status boolean | Admin-only management, uniqueness and references retained; list has no supported filters |
| KB article create/update | categoryId numeric safe integer, title 3-200, nonblank content within TEXT bytes; update at least one | Author from auth; slug allocation, category existence/active status; no accepted status/author/viewCount/publishedAt |
| KB article list/detail | page/limit, search max 200, categoryId; articleId for detail | Published reader visibility and view counting unchanged; publication-state filter is not a supported API field |
| KB suggestions | title max 200 and/or description max 5000, at least one nonblank | Existing term extraction and bounded suggestions |
| KB publish/unpublish/archive | articleId; empty body | Route-derived state, archived-state conflicts and category checks retained |
| KB feedback | articleId; PUT isHelpful must be actual boolean; GET no consumed body/query | Auth-derived voter and existing visibility |
| Notifications | List: page/limit/unreadOnly true or false; read: notificationId; read-all: no client input | Recipient exclusively from auth. Existing read/read-all endpoints safely ignore spoofed body/query identity fields; retained and covered by existing tests |
| SLA | policyId; responseTimeMinutes/resolutionTimeMinutes actual integers 1-4294967295, resolution >= response; no active/priority/deadline fields | Minutes remain the unit; priority/active flags/deadlines remain server-controlled |
| Dashboard/analytics | Summary/distribution/workload/averages/compliance/satisfaction: no supported filters. Trend: period daily/monthly. Recent tickets: limit 1-10. Recent activity: limit 1-20 | Auth scope and loaded calculations unchanged; no invented group/date filters |
| Ticket reports and CSV/PDF | startDate/endDate, status, categoryId, priorityId, technicianId, search max 100, supported sortBy/sortOrder; JSON additionally page/limit; exports reject pagination | Existing date parser, sort enum and export bounds; report/format determined by route |
| Date-range reports/CSV | Required startDate/endDate | UTC dates, strict calendar validation, start <= end |
| Technician-performance and analytics PDF | Optional startDate/endDate | Existing calculations and format |
| SLA/category/priority/status reports and CSV | Optional dates. SLA: priorityId/categoryId/technicianId. Categories: priorityId/technicianId. Priorities: categoryId/technicianId. Statuses: categoryId/priorityId/technicianId | Explicit per-report allowlists; existing exports and aggregates |
| Audit retrieval | page/limit, search max 200, action/entityType max 100, actorUserId/entityId, startDate/endDate | Existing read-only audit service; no new logging features |

Optional fields retain their established null semantics. Unknown fields are rejected on sensitive mutation/list contracts or ignored where the controller never consumes them. Ignored values are not copied into persistence or used as identity. Authentication and role middleware precede validation for protected endpoints; business errors remain 401/403/404/409 as appropriate. Upload metadata is checked after Multer parsing and before controller/cloud/database work.

## Database alignment and deliberate limits

Reviewed migrations 001-020. User names 100, email 255, phone 30, department 150, profile URL 500; category name 100/description 255; ticket/article title 200; feedback comment 1000 all retain schema-compatible validators. Ticket descriptions, comments and resolution summaries retain their established 5000-character API cap, below TEXT capacity even with four-byte Unicode. SLA targets retain unsigned INT bounds. Audit filters follow the stored action/entity limits.

**KB payload conflict:** the existing JSON/urlencoded limit is still **10 KB for the complete request**, although the database supports 65535-byte article content and the frontend does not impose a matching whole-request byte limit. Large articles may receive 413 before field validation. This is reported rather than increasing payload limits or changing the frontend. The byte-cap unit test directly exercises the validator; HTTP tests separately verify the 10 KB boundary.

Deferred intentionally: SQL parameterization review, HTML/XSS sanitization, security headers, rate limiting, cookie/CORS/JWT changes, file-signature/Cloudinary restrictions, permission/IDOR testing, secret management and new audit features. No later Phase 18 subphase was implemented. Existing ignored extras on no-input endpoints are not a persistence gap. Live end-to-end mutations were not run against real data.

## Validation results

- Complete Node backend suite: 317 passed, zero failed, one existing conditional MySQL historical-attribution test skipped (318 tests total).
- Added mounted-router negative tests with controller sentinels: malformed IDs across parameterized routes; duplicate/structured query values; pagination overflow; invalid enum/date/sort; whitespace/type/length errors; privileged fields; missing/stale-token structure; valid frontend payloads; multipart metadata; exact BIGINT strings; parser errors; UTF-8 byte limits. Existing service tests continue checking transition/conflict behavior.
- Related KB action and attachment tests now assert rejected extras and still exercise valid requests, 404/409 behavior and successful uploads.
- `npm start` succeeded on temporary port 5091 and reported a successful MySQL connection. Existing `authCors.smoke.mjs` passed read-only negative auth checks against that instance. No cookies/CORS rules were changed.
- No backend lint/build script exists. Frontend build was not required: no client changes or frontend request-shape fixes were needed.
- Focused regression run: 29 tests passed. Final field-specific validation rerun: all 8 tests passed; syntax and `git diff --check` passed.

## Files changed

- Shared: `src/middleware/inputValidation.js` (new), `errorHandler.js`; `src/constants/userQuery.js` (new).
- Auth: `auth.routes.js`, `auth.validation.js`.
- Users: `user.routes.js`, `user.validation.js`, `user.service.js`.
- Tickets: `ticket.routes.js`, `ticket.validation.js`, `ticketAttachment.validation.js`.
- Knowledge Base: `knowledgeBase.routes.js`, `knowledgeBaseArticle.validation.js`.
- Notifications/audit: `notification.validation.js`, `audit.validation.js`.
- Tests: new `tests/inputValidation.test.js`; updated `knowledgeBaseArticle.publish.test.js`, `knowledgeBaseArticle.archive.test.js`, `ticketAttachment.test.js`.
- Documentation: this review and `INPUT_VALIDATION_ROUTES.md`.

## Postman negative-test checklist

Base URL: `http://localhost:5000/api/v1`. IDs below use **1** illustratively; replace with existing resource IDs and use an appropriate authenticated account. Structural failures should return **422** with the shared error envelope; malformed JSON **400**, oversized JSON **413**. Auth/role failures occur first on protected routes.

| Request | Invalid case |
|---|---|
| POST /auth/login | email array or malformed email; password longer than 1024 |
| PATCH /auth/change-password | missing confirmation, weak new password, oversized currentPassword |
| POST /auth/refresh | body `{ "userId": 1 }` instead of cookie-only request |
| POST /users | valid fields plus `passwordHash` or `isActive`; role array |
| PATCH /users/1 | `{ "role": "ADMIN" }` on profile-edit route |
| PATCH /users/1/status | `{ "isActive": "false" }` (string) |
| GET /users?page=0&limit=101 | invalid pagination; also try repeated `limit=1&limit=2` |
| GET /users?sortBy=password_hash | unsupported sort; try `search` longer than 200 |
| GET /tickets/abc | malformed ID; repeat with 0, -1, 1.5 and 18446744073709551616 |
| POST /tickets | blank title/description or extra `createdBy`, `status`, `responseDueAt` |
| GET /tickets/my?fromDate=2026-02-30 | invalid calendar date; reverse fromDate/toDate |
| POST /tickets/1/self-assign | `{ "technicianId": 1 }` as Technician |
| PATCH /tickets/1/assign | `{ "technicianId": "123abc" }` |
| PATCH /tickets/1/unassign | omit expectedAssignmentId; try 0, negative, fraction, huge value |
| PATCH /tickets/1/unassign | structurally valid outdated expectedAssignmentId should remain **409**, not 422 |
| PATCH /tickets/1/status | `{ "status": "CLOSED" }` on working-status route |
| PATCH /tickets/1/priority | `{ "priorityId": "CRITICAL" }` rather than numeric lookup ID |
| PATCH /tickets/1/resolve | `{ "resolutionSummary": "   " }` |
| POST /tickets/1/comments | content plus authorUserId/isInternal; repeat for internal-notes |
| POST /tickets/1/attachments | valid attachment file plus text `uploadedBy=1`; repeat for /tickets/1/comments/1/attachments |
| POST /tickets/admin/categories | whitespace name or 256-character description |
| PATCH /sla/policies/1 | zero/negative/fraction/string targets; resolution lower than response |
| POST /knowledge-base/articles | content blank; extra status/createdBy; complete body over 10 KB |
| GET /knowledge-base/articles?status=DRAFT | unsupported publication-state query |
| POST /knowledge-base/articles/suggestions | both fields blank or non-string description |
| PATCH /knowledge-base/articles/1/publish | `{ "status": "PUBLISHED" }`; repeat for unpublish/archive |
| PUT /knowledge-base/articles/1/feedback | `{ "isHelpful": "false" }` |
| PUT /tickets/1/feedback | rating 0/6/fraction/string or comment over 1000 |
| GET /notifications?unreadOnly=yes | invalid boolean filter or limit=101 |
| GET /dashboard/ticket-trend?period=hourly | unsupported period |
| GET /reports/tickets?startDate=2026-99-99 | invalid date; reverse dates; unsupported sortBy |
| GET /reports/tickets/export/csv?page=1 | unsupported export pagination |
| GET /audit-logs?actorUserId=abc | invalid ID; malformed date; repeated search; huge page |

Also confirm valid nullable category descriptions, empty search, apostrophes in search, multiline content, false booleans, empty action bodies and normal multipart file-only uploads continue working. No manual live mutation is needed to run the automated fixture tests.

# Phase 19.3 — Authorization / role regression

Reviewed 2026-10-14, starting from clean `main` at `c4fbdbd` (Phase 19.2 complete). Scope is final RBAC/resource authorization regression. No production source, frontend, schema, dependencies or RBAC architecture changed; 19.4+ was not started.

## Matrix and actual policy

[AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md) covers all **99 API method/path pairs** with Employee/Technician/Admin eligibility, resource conditions and denial behavior. `node tests/authorization.matrix.js` derives actual Express mounts/controller middleware using the existing endpoint inventory helper, compares all endpoints and role gates with the existing reviewed permission JSON, then generates the document. It fails if routes or declared roles drift. ALLOW* describes eligibility subject to ownership/state, not unconditional access to every resource.

- Missing bearer: 401. Wrong route role: 403. Hidden tickets, nested resources, personal notifications or unreadable KB: 404. Field injection: established 422. Valid-role state/stale-assignment conflicts: 409. Admin self-demotion/deactivation: established 400.
- Employee: own ticket/profile/notification data and Employee dashboard; active lookups and readable published KB. Generic ticket editing is allowed only on their own OPEN/ASSIGNED tickets, including the intentional `priorityId` field. Dedicated working-status/priority actions and assignment controls remain role-gated. No internal notes or internal-note attachments are visible, even on an owned ticket.
- Technician: own assigned list/mutations plus the intended unassigned queue/read policy. Detail, public comments/history and authorized attachment reads can cover unassigned or own tickets; replies, internal notes and uploads normally require current assignment. Another Technician's assigned ticket remains hidden. Queue filters intersect this policy rather than replacing it.
- Admin: intentional global ticket/management/report visibility and controls. Personal notifications still require exact recipient ownership. Self-role change and self-deactivation are rejected. No separate Admin notification override exists.
- Shared dashboard/statistics routes are role-scoped, not uniformly Admin-only. Employee counts are creator-scoped; Technician counts are assignment-scoped. Technician unassigned queue counts intentionally describe the shared queue. Admin management/analytics/report/audit endpoints retain their declared restrictions.

Route files were checked for authentication/role middleware before sensitive controller access. Shared resource routes deliberately rely on service ownership checks after authentication; absence of an Admin gate there is not a defect. Services verify current ticket owner/assignment, comment/attachment parents, internal visibility and notification recipient. No missing protection or controller-only bypass was confirmed.

## Direct API execution

The existing `tests/permissions.mysql.smoke.js` was extended rather than duplicating Phase 18.12's infrastructure. It passed **205 real HTTP/MySQL authorization checks** with five distinct local fixture accounts (Employee A/B, Technician A/B, Admin), neighboring fixture IDs and real services/repositories. Generated passwords/tokens were not printed or saved. Its earlier baseline passed 40 checks before extension.

| Area | Final evidence/result |
| --- | --- |
| Employee allowed controls | PASS: own profile, active category/priority lookups, own ticket/history, own list/count/dashboard, safe editable priority field, personal notifications and published KB. Existing successful endpoint smoke additionally verifies creation/public comment/upload/download/closure/reopen/rating. |
| Employee vertical denials | PASS: assigned-ticket/queue/Technician summary/self-assignment, internal notes, working-status/priority endpoints, users/role/state, category management, Admin assignment/unassign, SLA configuration, KB management, Admin analytics, reports/exports and audits. The all-route test covers every declared wrong-role gate. |
| Horizontal ticket access | PASS: other Employee's detail/edit/comment/upload/close/reopen/feedback/history/attachment is hidden. Existing IDOR tests additionally cover deletion and swapped child IDs without reaching writes/providers. |
| Technician allowed controls | PASS: scoped assigned list, unassigned/own queue/read/history, own profile/dashboard/counts, active lookups, internal visibility on a readable assigned ticket, notifications and published KB. Existing successful endpoint smoke verifies self-assignment, status/priority/resolve, public/internal replies and attachment handling. |
| Technician denials | PASS: other Technician's status/priority/resolve/comments/internal-note/upload/download, Admin assignment/unassign, users, SLA, KB management, reports/exports/audits and Admin workload/analytics. Injected self-assignment technicianId is rejected. |
| Admin allowed controls | PASS: global queue/detail of all four fixture tickets, inactive-category management visibility, actual assignment to A then reassignment to B and current-ID unassign, role/activity changes. The existing 99-endpoint smoke exercises successful user/category/SLA/KB/dashboard/report/export/audit controls. |
| Admin safety/notifications | PASS: self-role change and self-deactivation return 400; profile update cannot inject role/state. All 25 actor/recipient notification combinations obey ownership, including Admin denial for others. |
| Internal notes/files | PASS: Employee list/read omits internal content and internal attachments; attempted internal attachment download/comment upload is 404. Technician/Admin see the permitted internal rows. |
| Parent-child resources | PASS: foreign attachment/comment IDs do not become accessible under a readable ticket; provider boundaries are never reached by denied calls. A known assignment ID from another fixture ticket cannot unassign the target ticket (409). |
| Scope and metadata | PASS: Employee A/B each sees exactly two owned fixture tickets and scoped totalRecords=2 even with limit=1; dashboard/distribution total=2. Technicians each see one own assigned ticket, scoped counts=1 and three searchable queue tickets (two unassigned plus own). Another technician filter returns zero. Admin sees all four fixture tickets. |
| Field/filter injection | PASS: requesterId/userId/technicianId filters cannot widen scope; unknown fields are 422. Role/isActive/requester/assignee/status/priority aliases in ticket create/edit are rejected. Body userId cannot retarget password change. auth/me ignores another user's query ID and still returns only the authenticated profile. |
| Category/priority/SLA | PASS: all roles can read active lookups; inactive category is absent there but present for Admin management. Priority mutation management does not exist; per-ticket priority permissions and Admin-only SLA management were tested according to actual routes. |
| KB states | PASS: Employee/Technician see the fixture only when PUBLISHED; DRAFT/ARCHIVED detail is 404. Admin reads all three states. Lower roles cannot mutate/publish/archive/manage categories. |
| Reports/exports/audit | PASS: lower-role middleware denial includes every report/export route; the successful Admin endpoint smoke returns JSON reports, CSV/PDF files and audit data. Audit Admin 200, lower roles 403 and anonymous 401 are covered. |
| Role/activity during session | PASS: Admin role change revokes refresh sessions; old refresh is 401. Old bearer claims do not override current DB role: me reflects Technician and queue access uses that new role immediately. Deactivation revokes refresh and protected access becomes 403. New-login/current-role refresh behavior is also retained from Phase 19.2. |

No wrong-role success, cross-Employee protected-resource disclosure or unauthorized mutation was found. No production authorization fix was needed. Admin actor changes and all assignment/role/activity audit events remained enabled; test convenience did not bypass production policy.

## Reused tests and verification

- Baseline and final `node --test tests/*.test.js`: **379 passed, zero failed, one opt-in skipped** (380 total). The unrelated opt-in reports DB test was not enabled.
- `node --test tests/permissions*.test.js`: **5 passed**, zero failed (overlapping full-suite coverage). Includes **211 actual HTTP authentication/wrong-role denials over 99 routes**, **54 object/field denials**, **45 ticket reads** and **25 notification ownership combinations** using mocked persistence, plus current-role/inactive identity checks.
- That focused suite also ran real Socket.IO clients for all five actors: each joined only its own user room and its transport room; stale Admin claims/client identity/room fields and join/subscribe attempts could not redirect recipient identity. Each received only its own notification. User lookups are mocked in this socket test; this is basic identity/room regression, not Phase 19.12 full realtime testing.
- Expanded `node tests/permissions.mysql.smoke.js`: **205 passed**, with zero provider calls and rollback verification. HTTP result count excludes login setup and the extra stale-refresh assertion.
- Existing `node tests/endpoints.mysql.smoke.js`: **99/99 successful endpoints, 133 HTTP checks**, provider stubs; rollback verified. Reused successful role examples, without adding deeper feature suites.
- Existing read-only `node tests/permissions.bigint.mysql.smoke.js`: passed distinct BIGINT identity preservation.
- Existing `npm run test:sla`: **89 passed**, overlapping full-suite coverage.
- Client roleRoutes/protectedRoute/passwordChangeRoutes smoke scripts passed quick route-guard/role-home/forced-change expectations. These are React SSR/component checks, not a new full browser/integration test. Backend direct API tests remain authoritative. No client fix was made, so frontend build/lint was not rerun in 19.3; there is no frontend npm test script.
- Backend has no generic npm test or lint script. The existing Node runner/configured SLA script were used. Added/changed JavaScript syntax checks and Git whitespace checks passed. Normal final startup and live health passed (server/database UP/UP), with no startup error/warning indicator.

Actual external Cloudinary delivery/upload and SMTP delivery were **not tested** in 19.3. Permission-smoke providers throw if reached; authorized provider-boundary behavior uses the existing endpoint smoke's stubs. No real asset or email was created. Deployment, load behavior, full workflows and exhaustive combinations of role with every business state remain outside this phase. The matrix describes reviewed policy; successful endpoint smoke supplies at least one positive actor per endpoint, not every eligible actor/state combination.

## Cleanup, reproduction and Git state

All fixture users, tickets, internal comments/files, notifications, categories, KB rows, sessions, assignment/history/audit rows and role/activity mutations run within the existing outer MySQL transaction with service savepoints. Rollback preserves existing data/history; follow-up queries verify no fixture users/tickets/notifications/refresh sessions/actor audit events remain. The primary development Admin was never selected or changed. Rolled-back AUTO_INCREMENT allocations can leave gaps.

Run from server/:

```powershell
node tests/authorization.matrix.js
node --test tests/permissions*.test.js
node tests/permissions.mysql.smoke.js
node tests/endpoints.mysql.smoke.js
```

The MySQL mutation smokes refuse production and non-loopback database hosts and require the existing local schema/active seeded category and priority. Only generated fixture identities are mutated. The matrix generator performs source/runtime inspection without executing business endpoints or querying the DB.

Changed files: `tests/permissions.mysql.smoke.js`, new `tests/authorization.matrix.js`, `AUTHORIZATION_MATRIX.md` and this report. No credential/env/token/debug/upload/dump file is pending commit. Specifically identified baseline/focused/final/SLA outputs were removed. Final diff/status contains only these four intentional test/documentation files; no commit was created. **19.4+ was not started.**

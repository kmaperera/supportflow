# Phase 19.7 — Ticket lifecycle testing

Completed: **59 new Node tests**, **127 real HTTP/MySQL lifecycle cases**, and **8 actual-browser checkpoints**. No production regression was reproduced; application source, authorization and lifecycle rules are unchanged. Phase 19.8+ was not started.

## Final transition matrix

`A` = assign/self-assign; `W` = dedicated working-status action; `R` = resolve with note; `E` = owner Employee/Admin action; `U` = Admin unassign with current assignment ID. `—` means no normal action to that target. `U` is an intentional assignment-workflow reset outside the core `ticketStatus` utility's nine allowed edges.

| From \ To | OPEN | ASSIGNED | IN_PROGRESS | WAITING_FOR_USER | RESOLVED | REOPENED | CLOSED |
|---|---|---|---|---|---|---|---|
| OPEN | — | A | — | — | — | — | — |
| ASSIGNED | U | — | W | — | — | — | — |
| IN_PROGRESS | U | — | — | W | R | — | — |
| WAITING_FOR_USER | U | — | W | — | R | — | — |
| RESOLVED | — | — | — | — | — | E | E |
| REOPENED | U | — | W | — | — | — | — |
| CLOSED | — | — | — | — | — | — | — |

| From → To | Allowed? | Allowed role | Preconditions | Expected side effects |
|---|---|---|---|---|
| OPEN → ASSIGNED | Yes | Admin assignment; Technician self-assignment | Eligible active Technician; unassigned OPEN ticket and consistent assignment records | Active assignment, assigned technician, one status/history row with actual actor, one assigned-Technician notification. Admin assignment additionally audits TICKET_ASSIGNED; self-assignment has no new audit category. |
| ASSIGNED → IN_PROGRESS | Yes | Assigned Technician or Admin | Assigned ticket | Working status, first-response timestamp set only if absent, one history row and requester STATUS_CHANGED notice. |
| IN_PROGRESS → WAITING_FOR_USER | Yes | Assigned Technician or Admin | Assigned ticket | One history row and requester notice; original SLA deadlines/first response retained. |
| WAITING_FOR_USER → IN_PROGRESS | Yes | Assigned Technician or Admin | Assigned ticket | One history row and requester notice; working loop can repeat. |
| IN_PROGRESS / WAITING_FOR_USER → RESOLVED | Yes | Assigned Technician or Admin | Assigned ticket, trimmed 10–5,000-character resolutionSummary | Summary and resolved_at, one history row, requester TICKET_RESOLVED notice. Waiting-to-resolution is intentionally supported by backend and UI. |
| RESOLVED → REOPENED | Yes | Owner Employee or Admin | Ownership for Employee | Current resolution timestamp/summary and closed_at cleared, assignment remains active, first response/deadlines retained, one history row and assigned-Technician notice. |
| REOPENED → IN_PROGRESS | Yes | Assigned Technician or Admin | Assigned ticket | One history row and requester notice; first response is preserved. |
| RESOLVED → CLOSED | Yes | Owner Employee or Admin | Ownership for Employee | closed_at set, resolved_at/summary retained, one history row and assigned-Technician notice. |
| ASSIGNED / IN_PROGRESS / WAITING_FOR_USER / REOPENED → OPEN | Yes | Admin unassign | Active assignment and matching expectedAssignmentId | Assignment closed, assigned_to cleared, one OPEN history row, removed-Technician notice, TICKET_UNASSIGNED audit. All four lifecycle linkages pass; assignment races are outside this phase. |
| Other / same-state lifecycle targets | No | No normal lifecycle transition | Backend validation/state checks | 409 for current-state conflicts, no history/notification/audit success and no timestamp changes. Unsupported `/status` targets fail request validation with 422. |

Admin reassignment of an already active ticket preserves its working status. Same-Technician assignment can be an assignment no-op; it is not an arbitrary status action. Generic `/status` only accepts IN_PROGRESS and WAITING_FOR_USER; resolve/close/reopen require their dedicated endpoints. This phase does not invent cancellation/escalation/on-hold states or new audit categories.

## Requested results

| # | Area | Result / evidence |
|---|---|---|
| 1 | Matrix | Core 7×7 utility matrix has 49 table-driven cases and independent expected edges. Real API checks cover all seven source states against five dedicated lifecycle targets for Admin and the intended owner role (70 cases). Additional assignment creation/unassign linkages are tested separately as above. |
| 2 | OPEN creation | Actual Employee POST starts OPEN, unassigned, with created_at and null resolved/closed fields. Current creation service deliberately has no initial status-history row; its TICKET_CREATED notification is separate. No initial history feature was added. |
| 3 | OPEN → ASSIGNED | Admin and Technician self-assignment both create the intended active assignment/status history with the correct actor. Active assignment removes the ticket from the unassigned queue. |
| 4 | ASSIGNED → IN_PROGRESS | Correct new response/status/history, changed updated_at and first response pass through real API and UI. Positive-case updated_at was backdated on fixture rows inside a savepoint so timestamp precision cannot hide the update check. |
| 5 | Working loop | API full journey performs two waiting/resume loops with one ordered history row per success. Browser performs waiting/resume and F5 persistence checks. |
| 6 | Resolution | IN_PROGRESS and WAITING_FOR_USER resolution succeeds for assigned Technician/Admin. ASSIGNED, OPEN, REOPENED and terminal states reject direct resolution. Response reports the current RESOLVED state. |
| 7 | Resolution validation | Missing, empty and whitespace summaries return 422 at HTTP validation; ticket, timestamps, history, assignment, notifications and audits remain unchanged. Browser required-note feedback prevents blank resolution. Service-level validation uses established 400 errors. |
| 8 | Close | Owner Employee and Admin can close RESOLVED. OPEN, IN_PROGRESS, waiting and other invalid source states reject it. Generic Admin updates cannot bypass policy. |
| 9 | Reopen | Owner Employee and Admin can reopen RESOLVED. Existing assignment remains; current summary/resolved timestamp are cleared. Browser Reopen confirmation updates eligibility and survives reload. |
| 10 | Reopened resume | Assigned Technician/Admin can resume REOPENED → IN_PROGRESS. Direct REOPENED → RESOLVED is rejected until work resumes. |
| 11 | CLOSED terminal | Every tested dedicated lifecycle target from CLOSED rejects without changing row/history/timestamps/notifications/audits. Priority, edit, public/internal comments, resolve, reopen and upload guards preserve terminal state. Owner feedback remains an intentional permitted non-lifecycle operation. |
| 12 | Invalid transitions | Obvious forbidden paths are covered by matrix/API tests. Invalid lowercase/mixed case, space variants, null/empty, unknown ESCALATED and unsupported targets return clean 422 through `/status`. Schema ENUM and API vocabulary match exactly seven statuses. No internal SQL/stack detail or 500 is expected/observed. |
| 13 | Same-state | IN_PROGRESS → IN_PROGRESS, WAITING_FOR_USER → WAITING_FOR_USER and duplicate resolve/close/reopen requests reject 409 with unchanged snapshots; no duplicate history or notification. |
| 14 | Roles/ownership | Employee start/resolve and Technician close/reopen return 403. Wrong Technician work/resolve and other Employee close/reopen return 404. Generic Employee PATCH status is rejected (422); Technician/Admin generic PATCH is unauthorized (403). Backend remains authoritative. |
| 15 | History | Actual schema uses ticket_id, from_status, to_status, changed_by, changed_at. One row per successful transition, correct Admin/Technician/Employee actor and stable changed_at/id ordering pass. Failed snapshots are unchanged. API full journey has 11 rows, including two resolutions; browser's shorter journey has nine rows, also rendered as nine timeline entries. Creation OPEN is not an extra history row. |
| 16 | Timestamps | Resolution sets resolved_at; close alone sets closed_at. Reopen clears current resolved_at/summary/closed_at, retaining first response and assignment. Rejected CLOSED reopen/other transitions preserve all original fields. Timestamp fields parse/render normally; ordering uses ID as a tie-break for same-second times. |
| 17 | Re-resolution | RESOLVED → REOPENED → IN_PROGRESS → RESOLVED works; second summary replaces the first, new resolved_at is at least the original timestamp, and a second resolution history row appears. Same-second equality is valid at current schema precision. |
| 18 | Assignment linkage | Assign/self-assign actor/history linkage, active assignment preservation on reopen, invalid resolved/closed assignment, and four Admin unassignment status-reset branches pass. No multi-connection assignment consistency tests were started. |
| 19 | Notifications/email/audit | Matrix successes verify exact notice type and recipient; rejected/duplicate transitions preserve notification counts. Working/resolution notices go to requester; close/reopen go to assigned Technician. Existing notification unit suites also verify rollback and post-commit emission. Lifecycle service/controller code has no email send; no live email/provider operation is claimed. Ordinary status/resolve/reopen/close add no audit events under Phase 18 policy; main journey retains only its Admin assignment audit. Admin unassign intentionally adds its existing audit. |
| 20 | SLA integration | Matrix preserves original deadlines across working, resolve, reopen and close actions. First response remains through loops/reopen. Active priority change preserves status and uses existing deadline recalculation. Browser RESOLVED SLA content stops counting down. No full SLA recalculation/breach-policy certification. |
| 21 | Stale/concurrency | Two near-simultaneous actual service calls under a controlled row-lock model compete to close/reopen; one wins, the other returns 409, with one history/notice. Two real Technician browser tabs exercise duplicate Start Work and stale Wait after the other tab resolves; backend rejects and stale UI refetches, with no added history. Parallel physical MySQL transaction races are not claimed: isolated API fixture uses one connection/savepoints. |
| 22 | List/detail/cache | Representative transitions are verified against Employee My Tickets, Admin queue, Technician active list and SQL-backed Technician dashboard count, plus F5 on current detail. Actual assigned-list UI excludes RESOLVED; browser back/forward refetches and shows no invalid controls. Technician/Employee controls are checked in all seven states. Admin UI exposes controlled assignment and no arbitrary status selector; it does not currently expose resolve/close/reopen buttons despite API permissions. Effects/local state and explicit revisions are used; no TanStack Query redesign. |
| 23 | Bugs | No production lifecycle regression reproduced. Intended waiting-resolution, assignment reset and resolved/closed mutability policies are documented rather than redefined. |
| 24 | Fixes | Test-only corrected multipart field name, current feedback policy, actual history count without an initial OPEN row, role metadata selectors and ticket-specific waits before checking the final timeline. Test messages remain safe. No application fix applied. |
| 25 | Automation | New Node matrix/lock-model tests; real HTTP/MySQL smoke; shared lifecycle fixture; test-only HTML and two-tab CDP driver. Existing App/bootstrap/SQL fixtures reused without a new E2E framework. |
| 26 | Backend | Baseline: 379 passed/one skipped. Final full suite: **438 passed, zero failed, one opt-in reports DB test skipped** (439 total); new 59 tests included. `npm run test:sla`: **89 passed**. No generic backend npm test/lint script exists. Normal startup health server UP/database UP, zero warning/error indicators. |
| 27 | Frontend | All **59 existing smoke scripts passed**. Build/lint passed; existing bundle-size warning remains. No frontend npm test script exists. New actual-browser journey: **8 passed**, zero unexpected console warnings/errors, uncaught exceptions or CORS faults during assertions. Lifecycle UI source unchanged. |
| 28 | Git/cleanup | Six intentional new text files (matrix test, SQL smoke, lifecycle fixture, HTML/CDP and this report); no production-source changes or commit. Fixture data/history/session/notification/audit changes roll back, with post-rollback checks passed. Exact phase output files and browser profile removed. No credentials, JWT literals, refresh tokens, temporary SQL, uploaded binaries, screenshots, exports or debug artifacts included. |
| 29 | Scope | **19.8+ was not started.** Comments, uploads, feedback, notifications and SLA are only lifecycle integration spot-checks; specialized testing remains for its scheduled phase. |

## Reproduction and limits

Use the local nonproduction schema with at least two seeded active priority/SLA policies. Run from `server/`:

```powershell
node --test tests/ticket.lifecycleMatrix.test.js
node tests/ticket.lifecycle.mysql.smoke.js
```

For browser checks, start Vite from `client/` with `VITE_API_BASE_URL=http://localhost:5099/api/v1`, localhost port 5173, and isolated Chromium remote debugging port 9227. Run from `client/`:

```powershell
node tests/ticketLifecycle.cdp.mjs
```

The fixture owns localhost:5099 and refuses production/nonloopback database configuration. SQL and browser runs must be sequential because they own the same fixture port. Generated roles/tickets are separate local records; existing demo tickets are untouched. Matrix cases use nested savepoints to restore their own fixture state, then the entire outer fixture transaction rolls back. No existing historical row is manually deleted. AUTO_INCREMENT gaps may remain. API/controller work drains before pool restoration and rollback; only idle fixture transports are closed. Provider storage/email are process-local doubles, and credentials/tokens never appear in reports or failure bodies.

This is automated integration and a small service concurrency model, not human-operated UI testing, live provider delivery, parallel MySQL race certification, complete assignment/comment/attachment/SLA testing or full E2E sign-off. The documented existing policies are the expected results; no new lifecycle states, UI redesign or audit categories were introduced.

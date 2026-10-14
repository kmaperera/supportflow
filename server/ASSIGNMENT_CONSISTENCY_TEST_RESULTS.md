# Phase 19.8 - Assignment Consistency Testing

Result: **PASS after fixing one reproduced reassignment defect** (2026-10-14).

| Requested check | Result | Evidence |
| --- | --- | --- |
| Unassigned ticket consistency | PASS | No active assignment; present only in unassigned queue; OPEN detail. |
| Self-assignment | PASS | One SELF history row with technician actor; OPEN to ASSIGNED; queue/list/workload changes. |
| Duplicate assignment | PASS | Both technician duplicates return 409 without any SQL side effects. Current-token Admin same-technician request is a no-op. |
| Concurrent assignment | PASS | Two native MySQL connections claim one ticket: one success, one 409, one assignment/history/notification. |
| Admin assignment | PASS | One ADMIN assignment with correct actor, status, notification and audit. |
| Reassignment | PASS | A to B closes old history, creates one active record, preserves working status and updates both lists/workloads. |
| Stale expectedAssignmentId | PASS | Current token succeeds; stale, missing or null token on assigned ticket returns 409. No ticket/assignment/history/notification/audit changes. Same-technician ABA and large string IDs covered. |
| Unassignment | PASS | Current token clears assignment, closes history and returns ticket to OPEN/queue. Duplicate and stale unassignment return 409 without mutation. |
| Assignment history | PASS | SELF/admin A/admin B records, actors and closure timestamps match the sequence; status history contains only actual status changes. |
| One-active-assignment invariant | PASS | Inspected real schema and SQL snapshots; both native races preserve ticket/active-history agreement. |
| Workload/list consistency | PASS | A +1, A -1/B +1, B -1; queue, both My Assigned lists, Admin list, detail and workloads reflect each mutation. |
| Authorization | PASS | Employee cannot claim/assign/reassign/unassign. Technicians cannot use Admin mutations or inject another technician ID into self-assignment. |
| Notifications/audit smoke | PASS | Exact notification types/recipients and Admin audit counts/actors; stale, duplicate and no-op operations emit no extra rows. |
| Transaction failure | PASS | A real SQL reassignment fails during notification creation after closing old history; rollback restores the complete pre-request snapshot. Existing notification/audit failure unit tests also pass. |
| Lifecycle interaction | PASS | Reassignment preserves ASSIGNED/IN_PROGRESS/WAITING_FOR_USER/REOPENED; RESOLVED/CLOSED assignment and unassignment rejected without writes. Existing lifecycle suite covers valid unassignment back to OPEN. |
| UI confirmation/refresh | PASS | Actual Chrome/React dialog retains old token across removal and recreation of the same technician assignment; stale confirmation fails safely, fresh retry succeeds, detail/history refresh and F5 work. Existing Admin journey verifies ticket lists and workload UI. |

## Reproduced defect and focused fix

The real local API rejected a valid current `expectedAssignmentId` on reassignment with 422 because the field was not allowed. Inspection also showed reassignment did not compare the caller's assignment snapshot, allowing stale Admin decisions to overwrite newer assignments.

The assignment validator/controller now accept and forward the token. The service compares it with the active assignment ID **after locking the ticket row**, before same-technician no-op or mutation. Initial assignment uses null/omitted token to mean "observed unassigned"; an already assigned ticket requires its current token. A stale token returns 409 even when the technician ID is unchanged. Existing direct API tests now explicitly send the observed ID for reassignments/no-ops.

The React confirmation captures the expected ID when Continue opens the dialog, passes it through the API client, and displays the safe conflict message while refreshing the ticket. No schema, role, lifecycle or notification policy changes were made.

The real schema has a **nonunique** `(ticket_id, unassigned_at)` lookup index, not a database uniqueness constraint. The service consistency checks and InnoDB ticket row lock enforce the invariant for application mutations; arbitrary direct SQL bypassing the service is not protected by a unique constraint.

## Verification

Run backend commands from `server/`, client commands from `client/`:

- `node --test tests/*.test.js`: **439 passed, 1 existing opt-in reports database test skipped**, zero failures.
- `node tests/ticket.assignmentConsistency.mysql.smoke.js`: **40 actual HTTP/MySQL checks passed**, including rollback failure; fixture transaction rolled back.
- `node tests/ticket.assignmentRace.mysql.smoke.js`: **two native MySQL races passed**, each using two distinct connections. Also covers reassignment versus unassignment with the same token. Generated committed fixture rows and all related assignment/history/notification rows were removed and absence asserted.
- Existing MySQL smoke suites: lifecycle **127**, endpoints **99 endpoints / 133 checks**, authorization **205**, security workflows **78**, and Admin audit **24 audit rows** all passed.
- `node tests/assignmentConsistency.cdp.mjs`: **3 actual browser regression checkpoints passed**, with Vite localhost:5173, API localhost:5099 and Chrome CDP port 9228.
- `node tests/adminWorkflow.cdp.mjs`: **15 existing actual browser checkpoints passed**, CDP port 9226. Browser fixtures rolled back.
- All **59** existing `tests/*.smoke.mjs` client scripts passed, including exact null/current BIGINT token payloads and 409 propagation.
- Client `npm run lint`: passed with no warnings. `npm run build`: passed; existing large-bundle warning remains.
- Backend source `node --check`: passed. Backend package has no lint script or generic test script; available full Node suite used above.
- Actual `node src/server.js` startup and `/api/v1/health`: **server UP, database UP**.
- Final `git diff --check`: passed. No commit created; changes left for review.

External SMTP/Cloudinary use controlled fixture doubles; detailed delivery testing and load testing are outside this phase. Native race tests exercise actual service/SQL transactions rather than simultaneous HTTP requests; real HTTP authorization and mutation behavior are covered by the other suites. No Phase 19.9 work started.

## Files changed

Production (five files):

- `server/src/modules/tickets/ticket.validation.js`
- `server/src/modules/tickets/ticket.controller.js`
- `server/src/modules/tickets/ticket.service.js`
- `client/src/api/ticketApi.js`
- `client/src/pages/admin/AdminTicketAssignment.jsx`

Focused regressions added:

- `server/tests/ticket.reassignConcurrency.test.js`
- `server/tests/ticket.assignmentConsistency.mysql.smoke.js`
- `server/tests/ticket.assignmentRace.mysql.smoke.js`
- `client/tests/assignmentConsistency.cdp.mjs`

Existing tests updated only for the observed assignment-token contract:

- `server/tests/audit.admin.test.js`
- `server/tests/audit.admin.mysql.smoke.js`
- `server/tests/endpoints.mysql.smoke.js`
- `server/tests/permissions.mysql.smoke.js`
- `server/tests/security.workflows.mysql.smoke.js`
- `server/tests/ticket.assignmentNotifications.test.js`
- `client/tests/adminAssignment.smoke.mjs`
- `client/tests/adminWorkflow.cdp.mjs`

This results file is also new. Final working tree: **13 modified files, 5 new files**; no temporary test files or browser profiles retained.

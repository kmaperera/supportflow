# Phase 19.5 — Technician workflow testing

Scope: the implemented Technician journey only. Admin and Employee API calls prepare controlled tickets and exercise the Employee side of reopening/closing and public visibility. They do not start Phase 19.6 or later.

The new browser driver renders the actual App, auth provider, shared layout and Technician pages. It uses native Axios HTTP, cookie-backed refresh, local MySQL and Socket.IO. It reuses the Phase 19.4 bootstrap and transaction fixture; only external email and attachment storage/delivery are doubled. Two generated active Technicians, two Employees and one Admin are disposable. Credentials and issued tokens stay in memory. Existing seeded priorities/SLA policies are read, and fixture data and timestamp changes are rolled back.

Final Technician browser/MySQL run: **12 checkpoints passed**, zero unexpected renderer/console/CORS faults, with post-rollback checks passed. The existing Employee browser/MySQL journey was rerun after the shared fixture change: **11 checkpoints passed**, with rollback verified.

## Requested results

| # | Area | Result / evidence |
|---|---|---|
| 1 | Accounts/setup | Dedicated Technician A/B, controlled unassigned and B-assigned tickets; A begins with an empty assignment list. Eleven further controlled tickets exercise real pagination. No existing account is changed. |
| 2 | Login/layout/dashboard | Actual login redirects to Technician home, with Technician navigation and no Admin links. Empty assigned statistics match the API. Existing dashboard smoke tests cover loading/error/nullable contracts. Dashboard recent items are informational in the current UI; page links provide navigation. |
| 3 | My Assigned Tickets | Empty state, own self-assigned ticket, search/no-result/clear, category/priority/status/sort combinations and Next/Previous with eleven active tickets. B's assigned ticket is excluded. Resolved/closed tickets leave the active list as designed. |
| 4 | Unassigned queue | Ticket-number and title search, harmless special-character no-result input, clear, category/priority/OPEN combinations, oldest/newest sort and two-page navigation. Cards retain requester/category/priority/status/created metadata. Cards do not currently render separate SLA timers. |
| 5 | Self-assignment | Rapid double click makes one POST and one assignment row; ticket disappears from queue and appears in A's list. Backend derives A from auth; a supplied B identity is rejected with 422. B's later claim returns 409. This is a sequential conflict smoke, not simultaneous real-database concurrency testing. |
| 6 | Ticket workspace | Unassigned inspection is read-only. Own detail shows assignment, details, SLA, conversation, notes, attachments and status history without an Admin reassignment combobox. Initially empty sections/nullable resolution render. B's direct URL displays not-found with no protected title. |
| 7 | Status | ASSIGNED → IN_PROGRESS → WAITING_FOR_USER → IN_PROGRESS works through actual controls. Unsupported ASSIGNED target returns 422; repeated IN_PROGRESS returns 409. CLOSED removes normal mutation controls. Existing status/history tests cover the broader contract. |
| 8 | Priority | Actual control changes priority once; API priority and recalculated resolution deadline change. Malformed priority returns 422. |
| 9 | Public reply | Whitespace validation, rapid duplicate submission protection, one persisted public comment with A as author, refetched UI and Employee public visibility. Special characters render as text. |
| 10 | Internal note | Clearly separate staff-only section, success/refetch and one persisted note attributed to A. Employee comments API contains public rows only. No UI-only permission assumption. |
| 11 | Attachment | Real multipart HTTP upload of a harmless TXT file, pending control, refreshed filename/uploader, authenticated download Blob with exact original bytes and filename. No OS download or live provider operation. Existing attachment smoke tests cover rejected file types. |
| 12 | Resolution | Whitespace is rejected in UI and API (422) without resolving. Injected 500 leaves the ticket unresolved. Valid note resolves once, displays summary/parseable resolved time and removes the form; duplicate API resolve returns 409. |
| 13 | Reopened ticket | Employee API reopens; actual Technician Resume Work returns it to IN_PROGRESS. It can be resolved again and closed by Employee setup. |
| 14 | SLA | Rolled-back fixture-only absolute deadlines produce warning and breached UI. Countdown text changes over 2.2 seconds with no new REST requests. Existing SLA suite verifies broader rules; no production timestamps are touched. |
| 15 | Notifications | Actual recipient inbox; persisted notification emitted into A's Socket.IO room appears. Unread View Ticket PATCHes then navigates; already-read navigation does not PATCH. Injected read failure still navigates and leaves the SQL row unread. Existing shared notification smoke tests cover empty/pagination/error rendering. |
| 16 | Workload/statistics | Factual workload and SLA summary load. API status distribution sums to A's one assigned closed ticket before pagination setup, excluding B's ticket. No rankings or gamification introduced. |
| 17 | Profile | A's current details render and reload. Existing profile is read-only, with no ordinary self-edit/password action; forced-change/auth behavior remains Phase 19.2 coverage. |
| 18 | Theme/mobile | Light/Dark keyboard toggle and stored dark preference survive reload. Native mobile drawer traps Tab/Shift+Tab, locks scroll and closes on Escape, backdrop and route change. Detail with long description/note/filename fits 320/375/430px. No System option added. |
| 19 | Accessibility/loading/error | Enter opens a ticket card; Space activates theme; drawer keyboard checks pass. Delayed self-assignment/upload/resolve expose disabled pending controls. Assigned-list injected 500 shows error and Retry recovers; resolve failure does not falsely succeed. Existing shared smoke tests retain focus/badge/feedback contracts. Technician status/resolve controls use buttons/forms, not ConfirmDialog. |
| 20 | Sessions | Detail/profile reloads restore cookie-backed auth. Expired access recovers automatically. Logout clears memory, re-login works after logout completes; revoked refresh removes auth and protected content. |
| 21 | Direct URLs/authorization | Actual authenticated hash routes and F5 exercise dashboard, assigned list, queue, own detail, notifications, workload and profile. Other Technician and nonexistent valid numeric ticket IDs show not-found. |
| 22 | Refresh/stale data/audit | Assignment, status, priority, reply, note, attachment, resolution and notification updates appear through existing local state/refetch/revision behavior. These pages use effects and explicit refresh rather than TanStack Query hooks. No query-key redesign. A's ordinary workflow creates no new non-auth audit actions. |
| 23 | Bugs | No production regression reproduced. Test-driver synchronization/selector assumptions were corrected during development. |
| 24 | Fixes | Test-only waits for mounted controls and completed logout/re-login; scoped browser-evaluation variables and explicit values passed into that context, reload context recovery and bounded CDP/target-close waits. Failed-refresh checks assert the final login destination directly: the intermediate protected route can redirect before a browser poll observes it. No application behavior changed. |
| 25 | Tests | New Technician browser HTML and CDP journey; optional Technician B and second seeded priority exposed by shared fixture. Existing Employee fixture defaults retained. |
| 26 | Backend checks | Full Node suite: 379 passed, zero failed, one opt-in report database test skipped (380 total). `npm run test:sla`: 89 passed. No generic npm test/backend lint script exists. Normal startup health: server UP/database UP, zero startup error/warning indicators. |
| 27 | Frontend checks | All 59 existing smoke scripts passed. `npm run build` and `npm run lint` pass. Existing bundle-size warning remains. No frontend npm test script exists; smoke files run directly. |
| 28 | Git/cleanup | Four intentional files: this report, Technician HTML/CDP and shared fixture modification. No application-source change or commit. Exact phase output files/browser profile removed; no credentials, tokens, screenshots, uploads or debug logs added. |
| 29 | Scope | Phase 19.6+ was not started. This is a Technician integration smoke, not full lifecycle/concurrency/provider/Socket.IO/SLA/E2E certification. |

## Reproduction and boundaries

Use the local schema with at least two active seeded priorities having active SLA policies. Start Vite in `client/` with `VITE_API_BASE_URL=http://localhost:5099/api/v1`, host localhost, port 5173. Start isolated Chromium with remote debugging on port 9223, then run from `client/`:

```powershell
node tests/technicianWorkflow.cdp.mjs
```

The driver owns its fixture API on localhost:5099 and refuses a production/nonloopback database. Never use an existing signed-in browser profile. It verifies rollback removes generated users/tickets/notifications/refresh sessions/actor audits, with dependent rows and settings inside the same transaction. AUTO_INCREMENT gaps can remain. HTTP/controller work drains before pool restoration and rollback. Provider assets remain memory-only, and downloads are captured as Blob bytes.

The journey uses an outer SQL transaction with savepoints and one connection; it cannot certify multi-connection races. No human-operated session, live Cloudinary/SMTP, production TLS or exhaustive visual/accessibility certification is claimed. The renderer monitors unexpected console warnings/errors, uncaught exceptions and CORS failures; expected 401 recovery and controlled 500 failures are deliberate. Existing neighboring regression suites supply contract/edge coverage without beginning those later phases.

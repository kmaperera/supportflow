# Phase 19.4 — Employee workflow testing

Reviewed 2026-10-14 from clean `main`, `fab0823` (Phase 19.3 complete). **Employee workflow regression passed.** No production defect was confirmed; application source, dependencies, schema, authorization and UI design were unchanged. **19.5+ was not started.**

## Setup and executed journey

Added a focused Employee browser journey using the existing Chrome DevTools approach, not a new E2E framework. Actual React App/routes/layout, AuthProvider, Axios/native HTTP, Express controllers/services, MySQL persistence and Socket.IO ran together. A test-only HashRouter keeps fixture entry URLs reloadable while using the actual AppRoutes and pages. Tests drove DOM forms/buttons and checked persisted results rather than supplying canned API success responses.

The backend fixture refuses production mode and non-loopback DB hosts. It generates dedicated Employee A/B, Technician and Admin accounts inside an outer transaction. Employee A begins empty; Employee B's private ticket verifies scoping. Staff actors only prepare valid assigned/resolved states through actual APIs, not a new Technician/Admin workflow suite. Generated login credentials/tokens stay in memory and are not printed or committed.

Cloudinary byte storage/download and email transport are process-local test doubles. Actual multipart validation, authorization and attachment metadata persistence remain real. Browser downloads capture the actual returned Blob/filename before disk save, leaving no test binary. Controlled API failure/delay injection is confined to the fixture Axios adapter, which otherwise delegates to its native HTTP adapter.

The final `node tests/employeeWorkflow.cdp.mjs` run passed **11 journey checkpoints** with the assertions below. Checkpoints are groups of assertions, not a claim of 11 total API requests or coverage of every feature/state combination.

## Employee results

| Requested area | Result/evidence |
| --- | --- |
| Login/layout | PASS: real login redirects to `/employee`; Employee navigation is present without Admin/Technician links. Header/sidebar, profile and logout controls work. |
| Dashboard | PASS: fresh Employee has zero tickets and the actual welcome/empty state despite Employee B's ticket. A controlled API failure shows the error/Retry state and recovers. Later dashboard reads show the user's recent tickets. Summary cards/recent dashboard items are informational in the current implementation; navigation uses its explicit links. |
| Create and lookups | PASS: active category/priority options load through actual APIs; inactive fixture category is absent. Empty form highlights errors; whitespace title/description, 201-character title, 5,001-character description and injected requester are rejected with safe 422. UI limits remain 200/5,000. |
| Create success/duplicate prevention | PASS: rapid repeated submit creates exactly one persisted ticket and one browser POST; pending form is disabled. Success feedback and My Tickets redirect work. Ticket number matches `SUP-<current year>-<six digits>` dynamically, requester is Employee A, and the ticket appears in the list. The API itself was not given new idempotency semantics. |
| My Tickets/search/filters | PASS: ticket number search, no-result special-character search and clearing; eleven owned tickets exercise Next/Previous. CLOSED + priority and category + special-character title search compose correctly. Clear filters becomes disabled with no active filters. Existing shared filter-style tests retain neutral/pointer/not-allowed treatment. |
| Cards/detail | PASS: keyboard Enter on the whole-ticket link opens detail; number/title/status/priority/category/date and long special-character description remain readable. Null assignment displays Unassigned. API creator identity and SLA deadlines are verified; timestamps are parseable. |
| Editing | PASS: allowed title edit saves, detail updates immediately, and later lists/direct reloads show the changed title. Unknown requester/assignee/status/deadline fields return 422. Employee `priorityId` editing on an owned OPEN/ASSIGNED ticket remains intentionally permitted. |
| Public comments | PASS: whitespace reply is prevented; actual limit is 5,000. Successful reply appears after completion, exactly one persisted row belongs to Employee A, and author/timestamp rendering is retained. Existing conversation smoke tests also exercise malformed/error contracts and public-only rendering. |
| Internal notes | PASS: a real Technician-created internal note is absent from Employee UI and the actual backend comments response; no internal-note controls are exposed. UI-side filtering is not the permission boundary. |
| Attachments | PASS: harmless TXT file uploads with pending/disabled controls, success feedback and list refresh. Unsupported executable extension gives a clear client error. Downloaded Blob bytes and sanitized filename match the uploaded fixture. External provider delivery and OS file saving were not tested. |
| Status/history | PASS: valid staff setup plus Employee actions produce OPEN, ASSIGNED, IN_PROGRESS, WAITING_FOR_USER, RESOLVED, REOPENED and CLOSED history. API records have parseable chronological timestamps; UI timeline preserves that ordering and shared textual badges. Assignment history is authorized/read through API, but current Employee UI has no separate assignment-history panel. |
| Resolved/close/reopen | PASS: actual resolved status enables controls. Space opens the reopen dialog; Tab/Shift+Tab remain inside, Escape cancels and focus returns. Confirmed reopen updates UI/history. Subsequent valid resolution/close produces CLOSED and removes reopen controls. Direct invalid close and CLOSED reopen return 409. |
| Rating/feedback | PASS: UI saves rating 5, then updates it to 4 with changed feedback; database still has one record. Out-of-range 6 returns 422. Current UI explicitly states that previously saved feedback cannot be loaded after remount; no new read/prefill feature was introduced. |
| Notifications/navigation | PASS: empty inbox initially; unread View Ticket issues one read PATCH then navigates. Already-read navigation issues no duplicate read PATCH. Mark all as read updates unread count. Injected mark-read failure still navigates and leaves the real row unread. Existing client notification tests retain pagination/read/error contracts. |
| Realtime smoke | PASS: while inbox is open, a persisted notification emitted to Employee A's actual Socket.IO room appears via the existing reconciliation/refetch behavior. This is one workflow notification, not full Phase 19.12 testing. |
| Knowledge Base | PASS: real published fixture search/detail, no-result search and Clear filters; draft content is absent. Article content/category/date render as text; actual article detail uses the view-incrementing API. Helpful feedback API succeeds once. Current Employee UI has no category filter or helpful-feedback controls; these were not invented. |
| Profile/password | PASS: current Employee details/role only, direct profile reload restores auth. Profile is read-only; no Employee self-profile update feature or ordinary password-change action is exposed there. The forced-change UI was already covered in 19.2 and was not repeated. |
| Theme/responsive | PASS: Light/Dark toggle and `supportflow-theme` persistence across reload. Desktop 1280px and mobile 390px checks; long detail text has no horizontal overflow. Mobile drawer opens, locks body scroll, closes with Escape/backdrop/route change and restores scroll. No System theme option was added. |
| Keyboard/feedback/loading | PASS: Enter card navigation, Space dialog activation, Tab/Shift+Tab trap, Escape/cancel/focus return; delayed create/upload shows disabled pending controls. Inline success/error messages and existing toast/dialog behavior remain. Create/edit/close use inline feedback rather than newly added toasts. |
| Sessions/direct URLs | PASS: ticket/profile reloads restore cookie-backed auth; actual expired signed access token recovers via refresh without a navigation loop. Logout clears memory and login works again. Revoked refresh causes clean login navigation with protected content removed. Own detail, KB and profile paths work; nonexistent valid numeric ID and other Employee's direct URL show clean not-found states with no private ticket content. |
| Data refresh/audit | PASS: created/edited/comment/attachment/state/rating/read changes appear in relevant current UI or refetched route data. Ordinary own/other/not-found browsing does not add audit rows. Existing Employee pages primarily use effect/local state and explicit reload/revision updates, not TanStack Query hooks; no query-key redesign was made. |

## Existing feature limits and testing boundaries

Employee detail currently displays category, assignee, created/updated and resolved/closed timestamps, status, priority and description. Backend requester/SLA/resolution-summary fields are verified through API, but the Employee detail component does **not** render separate requester, SLA or resolution-summary panels. This is the existing implementation, not a falsely marked UI PASS or a newly added feature. The status timeline is present; assignment history is API-only. Profile updates, ordinary password-change controls, KB category filtering and helpful-feedback controls are not implemented in this Employee UI.

No live Cloudinary/SMTP operation, human-operated manual session, production deployment/TLS check, exhaustive priority/status/style combination or whole-application E2E certification is claimed. Existing smoke tests cover badge/formatting/error boundaries beyond the single live journey. Browser fixtures deliberately use local controlled data and external provider doubles. The renderer/network monitors found no unexpected React console warning/error, uncaught exception or CORS failure on the final journey. Expected 401 recovery and deliberately injected errors are part of the test.

## Verification, findings and cleanup

- Baseline and final backend `node --test tests/*.test.js`: **379 passed, zero failed, one opt-in skipped** (380 total). The unrelated opt-in reports DB test was not enabled.
- Existing `npm run test:sla`: **89 passed**, overlapping backend coverage. No generic backend npm test or lint script exists.
- All **59 existing client smoke scripts passed**, including Employee dashboard/layout/create/list/edit/detail/comments/attachments/state/rating/notifications/KB/theme/profile guards and neighboring features.
- Final new browser/MySQL journey: **11 checkpoints passed**, with rollback verification and no retained provider assets/downloads.
- Client `npm run build` and `npm run lint` passed; build retains the existing large-chunk warning. No frontend npm test script exists, so existing smoke files ran directly.
- Final normal backend startup/health passed: server/database UP/UP, no startup error/warning indicator. Added JavaScript syntax and Git whitespace checks passed.

**No production bug was reproduced and no application fix was applied.** New-driver issues were corrected during development: assumptions about empty-state wording, selector quoting/accessible title suffixes, waiting for completed refetch/mutation state, new-document detection on reload, pre-existing theme preference and keyboard activation/focus return. The backend fixture closes gracefully before restoring pool methods/rolling back so outstanding controllers can finish. These are test-harness corrections, not regressions hidden by changing the app.

Fixture users, tickets, comments, attachments, KB/category rows, notifications, sessions, assignment/history/audit rows and mutations live inside an outer transaction; inner service transactions use savepoints. Rollback removes them all, with post-rollback checks for fixture users/tickets/notifications/sessions/actor audits. Developer accounts/settings and historical audit rows were preserved. Rolled-back AUTO_INCREMENT allocations may leave gaps. Generated credentials/issued tokens remained in memory; temporary diagnostic output was removed from the final test. No screenshots or uploaded binaries were created for commit.

## Reproduction and final files

Use the existing local schema and an active seeded priority/SLA policy. Start Vite from client/ with `VITE_API_BASE_URL=http://localhost:5099/api/v1`, host localhost and port 5173. Use an isolated Chromium profile with remote debugging on port 9223, then run:

```powershell
node tests/employeeWorkflow.cdp.mjs
```

The script starts/stops its own local fixture API on localhost:5099. Do not point it at a production database or an existing logged-in browser profile. It uses actual Employee pages under a test-only hash URL to keep the fixture entry reloadable.

Changed files: this report; `server/tests/helpers/employeeWorkflowFixture.js`; `client/tests/employeeWorkflow.browser.html`, `employeeWorkflow.fixture.jsx` and `employeeWorkflow.cdp.mjs`. Specifically identified baseline/final/SLA outputs and the isolated browser profile were removed. Final Git status has only these five intentional test/report additions, with no env, operational credentials, JWTs, debug logs, test binaries or screenshots pending commit. No commit was created. **19.5+ was not started.**

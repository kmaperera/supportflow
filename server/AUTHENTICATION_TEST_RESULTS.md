# Phase 19.2 — Authentication testing

Run date: 2026-10-14. Starting point: clean `main`, `3295d02` (Phase 19.1 complete). Tested only authentication correctness; 19.3+ was not started. No production source, dependency, schema or authentication architecture changed.

## Routes and controlled accounts

Actual mounted routes are POST `/api/v1/auth/login`, `/refresh`, `/logout`, `/logout-all`; GET `/api/v1/auth/me`; PATCH `/api/v1/auth/change-password`. All six passed focused regression checks.

The new local MySQL harness generated five disposable accounts with real inserted IDs: active Employee, Technician and Admin; inactive Employee; active Employee requiring a password change. Their generated addresses/passwords were used only inside the test process and were not printed or saved. Admin role/activity changes targeted only these fixtures. The browser used the existing isolated cookie fixture account with in-memory persistence, not a developer account. No auth action sends email in the inspected implementation, and no email/provider operation was invoked.

## Authentication checklist

| Scenario | Result and actual behavior |
| --- | --- |
| Valid login | PASS for all three active roles: 200, user/profile, access JWT and refresh cookie; no refresh token in JSON. |
| Claims | PASS: access claims are only sub, role, type, iat and exp; no password/hash/secret. |
| Wrong/nonexistent/inactive login | PASS: identical generic 401 response, no Set-Cookie/access token and no extra session row. Inactive fixture has no session. |
| Missing/malformed/empty input | PASS under established **422** field-validation contract, not the checklist's suggested 400. Email case/outer whitespace normalize; passwords are preserved. A whitespace-only password with a valid email is an incorrect credential (401), not trimmed into a different password. |
| Login limiter | PASS in existing fresh-app tests: five failed/invalid attempts then safe 429 with Retry-After/standard headers; successful requests are discounted without clearing failures. No real-account brute force. The broad MySQL harness uses a process-local higher test limit to isolate invalid-input cases; production defaults are unchanged. |
| me | PASS: current profile with valid bearer; no token, tampered token and expired token return 401. |
| Token separation | PASS: refresh credential as bearer and access credential as refresh cookie reject with 401. |
| Refresh | PASS: valid cookie rotates and returns current profile/access token; missing, malformed, JWT-expired, DB-expired and revoked cookies reject safely. |
| Storage/expiry | PASS: DB stores 64-character SHA-256 hashes, not raw refresh JWTs; session and cookie expiry match signed exp. Revoked/expired rows cannot restore a session. |
| Rotation | PASS: old row revoked, replacement active/new cookie, old cookie rejected. |
| Concurrent rotation | PASS in existing service/unit and live MySQL repository checks: one winner from two simultaneous uses; failed replacement rolls back revocation. The live repository check uses separate real pooled transactions and deletes only its generated disposable hash rows. A two-request concurrent HTTP/MySQL E2E test was not added; the rollback-isolated auth harness deliberately uses one connection sequentially. |
| Startup/F5 | PASS in real Chromium with actual AuthProvider/StrictMode: new page starts without a memory token; one startup refresh rotates the cookie and restores authenticated state. Missing-cookie reload finishes unauthenticated without endless loading. |
| Axios recovery | PASS: three actual HTTP me requests with an expired signed JWT recover through one refresh and three successful retries. Existing adapter tests also verify retry-once, retried-401 termination, login/refresh/logout exclusions, request preservation, single-flight failure cleanup and subsequent recovery. |
| Logout | PASS: current refresh session revoked, exact cookie expired, client memory/state cleared and protected navigation returns to login. Repeated/no-cookie logout remains safe 200 and adds no duplicate successful audit event. |
| Logout-all | PASS: two independent local sessions both revoked, current cookie expired, both refresh attempts fail; browser confirmation UI clears the session and returns to login. |
| Access after revocation | PASS as an intentional stateless policy: existing access JWTs remain usable until expiry after logout-all/password change. Current DB role/activity and forced-change policy still apply; no blacklist was introduced. |
| Password change | PASS: correct current password changes the hash and revokes all active refresh sessions; old password fails, new password succeeds. Wrong current password, same password and confirmation mismatch return safe 400 and leave password/session state unchanged; short/missing uppercase/lowercase/digit criteria return 422. |
| Forced change | PASS: login/me allowed, one representative non-auth read returns 403 until password change; successful change clears the flag, revokes the old refresh session and permits access. Browser routes to change-password, then clears auth and requires re-login. |
| Deactivation | PASS: Admin deactivation revokes refresh sessions; subsequent login/refresh is generic 401; protected access is the established inactive-account 403. |
| Role update | PASS: Admin role changes **revoke refresh sessions**, so an old cookie fails and re-login is required. A new login/refresh reflects the current role. An old access JWT retains its signed old role claim, while me/authentication immediately uses the current DB role. No exhaustive authorization matrix was run here. |
| Cookie/storage/header | PASS: HttpOnly, SameSite=Lax, auth-scoped Path, aligned expiry/clearing, no browser token storage or app document.cookie access. Secure is false locally and true in production-mode cookie tests. Axios uses current memory bearer and withCredentials. |
| CORS | PASS: HTTP/MySQL requests from the configured localhost:5173 origin receive the allow-origin grant; real browser fixture uses its explicitly trusted localhost:5197 origin. No unexpected browser CORS/cookie issue occurred. |
| Envelopes/errors | PASS: established JSON success/message/data contracts; logout/logout-all/password-change intentionally omit data. Safe error envelopes reveal no JWT internals, hashes or SQL. 400/401/403/422/429 differences were preserved. |
| Audit regression | PASS: LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, LOGOUT_ALL, PASSWORD_CHANGED and selected REFRESH_TOKEN_REJECTED were recorded. Real test audit rows contain no generated passwords, captured JWTs/cookies or secret field keys. Failed/no-op sign-outs do not duplicate success events; exactly two intended password changes and one real logout/logout-all were recorded. |

## Executed tests and verification

- Baseline and final full backend: `node --test tests/*.test.js` — **379 passed, zero failed, one opt-in skipped** (380 total). The skipped DB reports test is unrelated and was not enabled in 19.2.
- Existing focused auth/cookie/session/rotation/password-transaction/login-limiter files — **8 tests passed**, zero failed; overlapping coverage, not additional unique full-suite tests.
- New `node tests/authentication.mysql.smoke.js` — **74 real HTTP/MySQL checks passed**, plus state/claims/cookie/audit assertions. Rollback verification passed.
- Existing `node tests/refreshRotation.mysql.smoke.mjs` — passed concurrent winner and replacement-failure rollback checks; generated rows cleaned up. No user account/password was modified by that existing smoke.
- Existing `npm run test:sla` — **89 passed**, zero failed, overlapping full-suite coverage.
- Seven existing client scripts passed: authEndpoints, refreshSession, refreshInterceptor, changePassword, passwordChangeRoutes, protectedRoute and accessToken smoke scripts.
- New `node tests/authentication.cdp.mjs` — passed actual React login/change-password/session-actions/provider/interceptor behavior with real Chromium cookies and actual Express/JWT code. Persistence is the existing in-memory backend fixture. It observed no runtime warning/error, unhandled exception, CORS failure, cookie issue or unexpected 500.
- Client `npm run build` and `npm run lint` passed; build retains its prior large-chunk warning. There is no client npm test script. Backend has no generic npm test or lint script; the existing Node runner and configured SLA script were used.
- Final normal backend restart and health passed: server/database UP/UP, no startup warning/error indicator. JavaScript syntax and Git whitespace checks passed.

Existing Phase 18 tests were reused for precise token/cookie/limiter guards; no new testing framework was added. Human-operated manual browsing, deployed HTTPS behavior and a browser session backed by the actual local MySQL database were **not tested** in this phase. The automated browser suite exercised the requested auth UI interactions; the separate HTTP/MySQL suite verified persistence. This does not claim full E2E or broad frontend integration sign-off.

## Findings, fixes and test isolation

**No production authentication bug was confirmed; no production fix was applied.** One initial harness expectation assumed old refresh sessions survived Admin role changes. Inspection showed the established deliberate revocation policy, so the test was corrected to require re-login and verify current-role refresh afterward. The new browser fixture's ThemeProvider import and native-dialog selector were corrected during setup. Browser teardown initially awaited a close-target response on the target's own websocket; Chrome closed the target first, leaving that command pending. The final harness closes via Chrome's HTTP endpoint and closes fixture HTTP connections, and now exits successfully. These were test-construction defects, not app failures.

The MySQL harness refuses production mode/non-loopback DB hosts. Fixture creation and all password/role/activity/session/audit mutations live inside an outer transaction; service transactions use savepoints. All writes roll back, with follow-up queries verifying zero retained fixture accounts, sessions and actor audit rows. Anonymous LOGIN_FAILED rows also roll back with that transaction. Existing accounts, credentials and audit history were preserved. Rollbacks/disposable inserts can leave AUTO_INCREMENT gaps.

Raw issued credentials stay in test-process/browser memory; outputs use counts and pass/fail stages only. Browser fixture strings are synthetic test credentials already used by the existing cookie helper, not operational account secrets. Application browser-storage inspection found only theme preference use; no production document.cookie read or token local/session storage was found. Test-only window helpers expose booleans/counters and accept an in-memory expired credential solely to drive recovery; no such helper is in production source.

## Reproduction and final files

From server/:

```powershell
node tests/authentication.mysql.smoke.js
node tests/refreshRotation.mysql.smoke.mjs
```

For the new browser test, use an isolated Chromium instance with remote debugging port 9223 and start Vite at **localhost:5197** (`npm run dev -- --host localhost --port 5197 --strictPort`). Then run `node tests/authentication.cdp.mjs` from client/. It starts/stops its own fixture API on localhost:5098. Use a disposable browser profile; no existing logged-in browser is required.

Changed files: this report; `server/tests/authentication.mysql.smoke.js`; `client/tests/authentication.browser.html`, `authentication.fixture.jsx` and `authentication.cdp.mjs`. Temporary baseline/final/focused/SLA outputs and the isolated browser profile were removed. Final Git status contains only these five intended test/report additions; no env, operational credentials, tokens, debug logs, test uploads or dumps are pending commit. No commit was created. **19.3+ was not started.**

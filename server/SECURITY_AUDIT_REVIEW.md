# Phase 18.17 — Security-sensitive audit actions

This phase reuses the existing `auditService.log()` and `audit_logs` table. It adds no alternate writer, public audit-write endpoint, schema migration, monitoring framework or new authentication feature.

## Event policy

| Action | Actor / target | Recorded when | Metadata |
| --- | --- | --- | --- |
| LOGIN_SUCCESS | Authenticated user / AUTH + user ID | Credential verification, session persistence and refresh-cookie preparation succeed | None |
| LOGIN_FAILED | NULL / AUTH + NULL | Validly formed login is rejected for wrong credentials, nonexistent account or inactive account | Controlled reasonCode: INVALID_CREDENTIALS or ACCOUNT_INACTIVE |
| LOGOUT | Revoked session's user / AUTH + user ID | An actual active stored refresh session is revoked and cookie cleared | None |
| LOGOUT_ALL | Verified stored session's user / AUTH + user ID | All-user session revocation succeeds and cookie cleared | Accurate revokedSessionCount |
| PASSWORD_CHANGED | Authenticated user / USER + user ID | Password update and refresh-session revocation commit, then cookie cleared | sessionsRevoked: true; forcedChange from the pre-update user flag |
| REFRESH_TOKEN_REJECTED | NULL / AUTH + verified user ID | A signed, unexpired credential matches a known revoked DB session; atomic rotation loses consumption while still unexpired; or an active session belongs to an inactive account | Controlled reasonCode: SESSION_NOT_ACTIVE or ACCOUNT_INACTIVE |

Existing LOGIN_SUCCESS/LOGIN_FAILED/LOGOUT/LOGOUT_ALL/PASSWORD_CHANGED constants were reused. Only REFRESH_TOKEN_REJECTED was added. The schema has no outcome column; success/failure is expressed by the action, without inventing an unsupported field. Anonymous failures have no fake user actor. A refresh rejection's entity ID is a correlated signed-and-stored subject, not an authenticated actor.

Success logging lives in the auth controller because it knows when cookies have been prepared/cleared. Login failure logging lives in the credential service, before its generic rejection. Refresh rejection logging lives in the rotation service. Each outcome is recorded at one location, avoiding controller/service duplicates.

`revokeRefreshSession()` returns the successfully revoked row's user ID for trustworthy logout attribution. The existing `revokeRefreshToken()` boolean API remains compatible. Unknown, absent, expired or already-revoked logout cookies retain idempotent successful cookie clearing but produce no misleading new logout event.

## Enumeration protection and noise decisions

The prior inactive-account login response was a distinct 403 after password proof. The requested generic-response rule is now explicit: wrong password, unknown account and inactive login all return **401 with the same response body, “Invalid email or password”**, without cookies or reason codes. Inactive refresh now returns **401 “Invalid refresh token”**, rather than disclosing inactivity. Internal ACCOUNT_INACTIVE context is available only in the existing authenticated ADMIN audit retrieval. Existing protected-resource inactive-account rejection is unchanged.

No attempted email, email hash or account identifier is stored for login failures. Invalid/missing input rejected by request validation is not audited. Login attempts that reach credential validation are recorded once; the existing login limiter bounds per-IP failures. Distributed failures can still grow the table, so metadata remains small. Neither login-limiter 429 nor general API 429 events were instrumented; middleware order, skipSuccessfulRequests, limits and responses were retained.

Valid refreshes, missing cookies, ordinary expiry, malformed/type-invalid credentials and unknown signed credentials are not logged. For a rejected signed cookie, `findRejectedByHash()` queries only a user ID for a matching revoked, unexpired stored session; it returns no credential/hash to the logger. A revoked row does not prove malicious replay, so the reason is SESSION_NOT_ACTIVE rather than an assertion of attack. A rotation that crosses the ordinary expiry boundary is also quiet. Diagnostic lookup failures cannot replace the original authentication rejection.

No every-request/access-token-verification, expired-access-token, generic 401/403/IDOR, report/page-load or wrong-current-password/validation-typo events were added. No separate SESSION_REVOKED event was introduced: password change, logout-all and existing Phase 18.16 admin deactivation/role-change events already communicate their respective operations. Revocation helpers remain uninstrumented, so admin actions are not double logged. There is no password-reset flow to instrument.

## Context, secrets and failure policy

All context uses Express-derived `req.ip` and authenticated user identity or a verified stored session. No actor, IP, action or outcome comes from request-body audit input. User-agent and request-ID fields are unsupported by the current schema and are not captured. No forwarding-header parsing or trust-proxy change was made.

Handlers pass only IDs, supported IP and controlled codes/booleans/counts. They never pass passwords, password hashes, JWTs/decoded payloads, refresh/access tokens, cookie/header values, complete requests, raw bodies, attempted emails, SQL, stacks or environment credentials. The Phase 18.15 recursive sanitizer and size cap remain in place. SDK/database errors are not copied to audit metadata or logs.

These security events use the existing **best-effort default** writer. Audit-insert failure after established login, successful revocation or committed password change logs only the safe audit-failure category and does not reject or undo that success. Authentication failures keep their existing generic rejection when audit insertion fails. Password mutation and required session revocation still share their original transaction; no success event is attempted when that transaction fails. Cookie preparation/clear precedes controller success auditing. No recursive audit-failure event, email or Socket.IO emission was added.

JWT type separation, one-time rotation, current role/activity checks, refresh hashing/revocation, mandatory-password-change restrictions, cookie path/HttpOnly/SameSite/production Secure behavior, CORS and memory-only frontend tokens remain unchanged.

## Viewer compatibility

The existing backend/client metadata allowlists now admit only the three known reason codes, sessionsRevoked/forcedChange booleans and a nonnegative safe-integer revokedSessionCount. Unknown fields remain excluded; malformed legacy metadata remains NULL-safe. Existing Admin metadata rendering remains React text/JSON. Action/entity filters are already free-text exact filters, requiring no new option UI.

There was no retrieval-route, authorization, response-shape, filter, sort, pagination or UI redesign. The audit API remains ADMIN-only GET, with no public write/mutation endpoint. This compatibility-only metadata extension does not begin Phase 18.18 hardening.

## Verification

- New `tests/audit.security.test.js`: ten focused cases/subtests cover success/session ordering, identical wrong/unknown/inactive login status/body, trusted IP despite spoofed forwarding input, token/secret exclusion, quiet valid/missing/malformed/type-invalid/expired/unknown refresh, expiry during rotation, known revoked-session/inactive refresh, genuine/idempotent logout, accurate logout-all count, forced password-change/session invalidation, failed session storage, failed logout/password revocation and audit-insert failure.
- Full backend suite: **377 passed, one skipped, zero failures** (378 tests). The final expiry-boundary guard was additionally verified by rerunning focused security tests and the live smoke.
- New `node tests/audit.security.mysql.smoke.js`: real local HTTP/controller/service/SQL flows verified **15 inserted rows: 14 security events across all six action types plus one admin deactivation**. Tests used disposable users/passwords, a few login failures below the limiter threshold, actual login cookies/tokens, password change, session invalidation, replay and inactive refresh, correct actors/targets, private metadata and Admin viewer retrieval. One admin deactivation produced one existing admin event, without an extra revocation event.
- The live check used an outer transaction and service savepoints. All users, password/session changes and audit fixtures were rolled back. No existing history was deleted; unused AUTO_INCREMENT gaps are expected.
- Existing admin HTTP/MySQL smoke passed again: 24 admin records across 22 action types, all rolled back; no admin duplication/regression.
- Backend startup/live health passed: server UP/database UP. Existing schema/index/FK/retrieval smoke passed with the original three audit rows intact.
- Client build, lint and audit API smoke passed. The smoke verifies only approved security fields survive client sanitization.
- Headless Chrome `/admin/audit-logs` fixture passed six widths in light/dark themes, overflow/control/console checks and explicit visibility of security-event flags. Browser fixture data is mocked; actual security-event retrieval was verified separately through HTTP/MySQL.
- Backend has no lint script. `git diff --check` passed.

## Changed files

- `src/constants/audit.js` and `src/modules/audit/audit.service.js`.
- `src/modules/auth/auth.controller.js`, `auth.service.js`, `refreshToken.repository.js`, `refreshToken.service.js`.
- New `tests/audit.security.test.js` and `tests/audit.security.mysql.smoke.js`.
- Existing cookie fixture, cookie/session/rate-limiter tests and password transaction expectation updated for the generic inactive rejection and safe internal password-change result.
- `client/src/api/auditApi.js` plus audit API smoke and polish fixture/browser checks, only for security metadata compatibility.
- This review.

No Phase 18.18 retrieval redesign, Phase 18.19 broad security-regression framework, Phase 18.20 final review, generic monitoring system or frontend auth redesign was started.

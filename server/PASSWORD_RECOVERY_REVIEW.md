# Pre-deployment password recovery and Admin reset

Implemented 2026-10-15. This adds recovery without starting Phase 20 or changing the existing temporary-password login policy.

## API and account policy

| Endpoint | Policy |
| --- | --- |
| POST `/api/v1/auth/forgot-password` | Valid email; identical 200 response for existing, missing and inactive accounts. Only active users receive instructions. No account details are returned. |
| POST `/api/v1/auth/reset-password` | Opaque token, new password and confirmation. Existing change-password complexity and length rules apply. Invalid/expired/used credentials return controlled 400; malformed fields return 422. |
| POST `/api/v1/users/:id/reset-password` | Authenticated Admin only; empty body and valid ID. Active Employee, Technician and Admin targets are supported, including self. Inactive targets return 400; missing targets return 404. |

Admin requests send an email link rather than exposing a password or token. Requests alone leave passwords, `must_change_password` and sessions unchanged. Successful recovery chooses a permanent password, clears `must_change_password`, and revokes every refresh session. Existing stateless access tokens can remain valid until expiry under the existing design. Logged-in Change Password still requires the current password and now invalidates outstanding recovery links in its existing transaction.

The Login page links to `/forgot-password`. `/reset-password?token=...` is public even when another session is open; completion clears the local session and offers Login without automatically signing in. Both pages have field errors, loading/duplicate-submit guards, persistent success feedback, theme controls and mobile layouts. Admin Users has a confirmation dialog, safe retry feedback and the success toast “Password reset instructions sent.”

## Storage, concurrency and delivery

Apply additive migration `database/migrations/022_create_password_reset_tokens_table.sql` before starting this version. It was applied to the local development database during verification. It creates a unique binary-collated SHA-256 hash index, user/expiry indexes, single-use timestamp and user FK. Raw credentials are generated with 32 cryptographically random bytes and appear only in the email/reset URL, not database rows, responses, audit metadata or logs. Expired/used rows may safely remain; no cleanup worker is required.

`PASSWORD_RESET_TTL_MINUTES` defaults to 15 and must be an integer from 5 through 30. Startup rejects invalid configuration. Expiry and consumption checks use UTC SQL time. The server constructs the URL from trusted `CLIENT_URL`; clients cannot supply a destination. Email HTML escapes names and the URL. Frontend referrer policy is `no-referrer`.

Issuance and redemption lock the user before touching recovery rows. A new request invalidates previous links. Redemption rechecks the token under the same lock and atomically updates the password, invalidates all recovery links, revokes refresh sessions and writes `PASSWORD_RESET_COMPLETED`. Concurrent redemptions yield one success and one rejection. A revocation/audit failure rolls back the password and credential consumption.

Public requests schedule a small in-process best-effort delivery task and respond before account lookup or SMTP. This avoids an obvious account-dependent SMTP timing difference. It is not a durable queue: a process exit can lose delivery; the user can retry. Delivery failure invalidates only that attempt's token and logs a category without secrets. Public responses remain generic. Admin requests await delivery and return a sanitized 502 on failure; the dialog supports retry. Successful SMTP submission is not a guarantee of inbox delivery.

Limits use the existing IP-based limiter: 3 forgot requests and 10 reset attempts per 15 minutes, independently, plus the general API limiter. Admin reset uses authentication, authorization and the general limiter. These limits remain process-local. Recovery endpoints are excluded from Axios automatic refresh/replay.

Audit actions are `PASSWORD_RESET_REQUESTED` (anonymous, no account/email metadata), `ADMIN_PASSWORD_RESET_REQUESTED` (Admin actor and target), and `PASSWORD_RESET_COMPLETED` (user and `sessionsRevoked`). No credential/email-body data is recorded.

## Verification

Final run: **451 backend tests passed, zero skipped/failed; 60 client smoke scripts passed; 5 native browser checkpoints passed; 35 live recovery checks and the native reset race passed.** Existing authentication (74 checks), authorization (205 checks) and security workflows (78 checks) also passed. The recovery SQL smoke additionally creates a temporary user through the Admin API, verifies forced-change protection, changes its password and verifies normal login. Frontend build/lint and clean backend startup/health passed. The existing production bundle-size warning remains. The local reset table is empty after fixture cleanup, with zero orphan rows.

- `RUN_REPORT_DB_TESTS=1 node --test tests/*.test.js`: full authentication, authorization, validation, security and recovery suite.
- `node tests/passwordReset.mysql.smoke.js`: real HTTP/MySQL Employee recovery and Admin/Technician reset, policy retry, hash/expiry/single-use, sessions, normal Change Password and audit privacy. Rollback-isolated fixtures.
- `node tests/passwordReset.race.mysql.smoke.js`: native pooled MySQL reset race, one committed winner and exact-ID cleanup of generated fixture rows.
- `node tests/authentication.mysql.smoke.js`, `node tests/permissions.mysql.smoke.js`, `node tests/security.workflows.mysql.smoke.js`: existing live authentication/forced-change and role/ownership workflows.
- Client `node tests/passwordRecovery.smoke.mjs` and existing smoke scripts: API payloads, credentials and recovery interceptor exclusions.
- Client `node tests/passwordRecovery.cdp.mjs`: normal application entry, native HTTP/MySQL and captured email; Employee old/new login, reused-link rejection, Admin cancel/error/retry, Technician recovery, refresh revocation/stale browser, loading/duplicate prevention, visibility controls, keyboard, dark theme and 320/375/430-pixel layouts. Run with Vite `VITE_API_BASE_URL=http://localhost:5099/api/v1` on localhost:5173 and an isolated Chromium CDP instance (`KEYBOARD_CDP_PORT`, default 9246).
- Client `npm run build` and `npm run lint`; backend clean startup and `/api/v1/health`.

Backend has no generic npm test or lint script; the actual Node test runner is used. Email delivery is captured/mocked in regression tests: live SMTP transport, provider inbox delivery and production HTTPS/proxy settings require verification before deployment. Existing unrelated dependency/data findings are not repaired by this feature. No credentials or exports are retained by tests.

# Phase 18.9 — JWT and session security

## Flow and preserved architecture

Login validates credentials with bcrypt, returns an access JWT/user in JSON, and creates a refresh JWT whose SHA-256 hash and expiry are stored in MySQL. The raw refresh credential is set only in the existing HttpOnly cookie. The frontend keeps the access token in memory. Protected HTTP requests verify the bearer token and reload the current user from MySQL; authorization uses that current role. Refresh verifies the cookie JWT and active hash record, checks the current user, consumes/replaces the refresh record, and returns a new access token and cookie.

Logout revokes the supplied refresh record; logout-all revokes that user's active refresh records. Password change updates the password and invokes existing all-session revocation. Cookie attributes and route contracts are preserved. No access-token blacklist, token families, device limit or new auth framework was added.

## JWT/configuration decisions

- Installed jsonwebtoken **9.0.3** remains in use. Signing explicitly uses **HS256** and verification restricts algorithms to HS256. No production `jwt.decode` authentication path exists. No custom clock tolerance was added.
- Actual local configuration and `.env.example` use **15-minute access** and **7-day refresh** lifetimes, unchanged. JWT verification now also requires a safe integer `exp` and a valid positive unsigned BIGINT `sub`; a signed token without expiry no longer passes. The JWT library still enforces signature, expiry and not-before checks.
- New access tokens contain `type: access` plus role/sub/iat/exp. Refresh tokens retain type=refresh, sub, iat, exp and cryptographically random UUID jti. There is no password/profile/refresh credential in access claims. Separate secrets plus type checks prevent cross-use, even if test secrets are deliberately made equal.
- Existing signed **untyped access tokens** remain accepted with valid identity and expiry so current short-lived sessions need not be invalidated. Any explicit non-access type is rejected. Refresh verification strictly requires refresh type. Issuer/audience were not added: the application has one issuer/consumer and existing sessions would require a coordinated migration for little additional separation beyond the separate keys/types.
- Startup now validates required JWT configuration before database connection/listening. Production rejects identical, missing, short, obviously repetitive or placeholder signing secrets. Secrets must be distinct random values of at least 32 characters. This check detects weak configurations; it cannot prove entropy. No fallback secrets are embedded in source.
- Duration validation uses jsonwebtoken's own sign/verify semantics: both durations must produce positive finite expiry, with refresh longer than access. No alternate duration parser or new lifetime policy was introduced. Unitless strings such as `900` mean milliseconds to the library and are rejected when they yield immediate expiry. See the [library reference](https://github.com/auth0/node-jsonwebtoken#readme).
- Existing local JWT configuration passed production-strength/lifetime checks without displaying secret values. No broader environment-secret audit was performed.

## Current-user and forced-password behavior

Bearer parsing remains strict. Missing, malformed, tampered, expired and wrong-type credentials return safe 401 responses. Inactive users return 403; roles remain current-DB values rather than stale token roles. Active checks now explicitly recognize boolean/numeric/string true rather than accepting string `0` through JavaScript truthiness.

The onboarding password-change rule was previously frontend-only. Authenticated users with must_change_password may now access **GET /api/v1/auth/me** and **PATCH /api/v1/auth/change-password**, but receive 403 for other protected HTTP resources. Login/refresh/logout/logout-all remain available through their existing flows. Socket authentication rejects forced-change users too. Boolean mapping of this flag now treats string `0` correctly.

An already issued access token immediately sees current role changes on its next HTTP request. Deactivated or deleted users cannot use protected HTTP resources or refresh. Refresh issues claims from the current database role. Socket handshakes likewise check current user state. Connected sockets now disconnect at the access token's expiry and clear their timer on disconnect; the next connection must authenticate again. There is no new proactive broadcast disconnect on role/deactivation/password changes, so an existing socket may retain notification access until its short token expiry or client disconnect.

Wrong passwords and nonexistent accounts retain the same generic 401 message. Inactive-account status is now disclosed only **after a correct password**; incorrect passwords for inactive accounts receive the generic 401 too. Login throttling and bcrypt hashing/comparison remain intact. No comprehensive login timing-equalization scheme was introduced.

## Storage, rotation and revocation

Before and after: `refresh_tokens.token_hash` holds a SHA-256 hash, not a raw bearer token; the existing VARCHAR(255) accommodates its 64-character hexadecimal representation. No schema migration is needed. Expiry is checked both by JWT verification and the repository's active/expiry predicate. JWT exp, DB expires_at and cookie Expires remain aligned. UUID jti prevents identical refresh JWTs issued in the same second.

Previously rotation used an atomic conditional revocation followed by a separate insert: it prevented two winners but an insert failure could strand the session. Now `refreshToken.repository.rotate` performs the conditional, unexpired, user-matching UPDATE and replacement INSERT in one transaction. Only one concurrent caller can consume a row. Insert failure rolls back revocation. Credentials are prepared before storage is changed; no new cookie is issued unless the transaction succeeds. Old-token replay is rejected. No family/reuse graph was added.

Logout, logout-all and password-change revocation tests pass. Already-issued bearer tokens are **not instantly revoked** by those actions; they remain usable until their 15-minute expiry subject to current user/role/forced-change checks. Password update and all-session revocation now share one transaction, so a revocation failure rolls back the password change too. A lost successful refresh response can still leave a client with an already consumed cookie, requiring login again; no grace window for replay was introduced.

The repository already has `deleteExpired`, but no scheduled caller is mounted. Expired/revoked rows cannot authenticate yet may accumulate until maintenance runs; no scheduler was added. Raw refresh credentials are not returned in JSON, logged or embedded in URLs. Existing request/error logs do not include cookie, Authorization or password bodies.

## Frontend audit

No client changes were needed. Access credentials remain in React/module memory; refresh credentials remain browser-managed HttpOnly cookies. Only the theme preference is stored in localStorage; no auth use of localStorage, sessionStorage or document.cookie was found. Token values are not sent in route/query/fragment URLs; socket auth uses its auth payload.

Startup refresh remains shared across StrictMode effects. The Axios interceptor uses one recovery promise, marks each retry, and excludes login/refresh/logout endpoints. It cannot recursively refresh a refresh 401 or endlessly replay a failed request. Authentication refresh failures clear token/user state; the intentional Phase 18.5 exception preserves state for temporary 429s without automatic retry. Startup failure resolves initialization to unauthenticated state; a startup 429 shows the existing rate-limit message.

## Verification and limits

- Final full backend suite: **338 passed, 1 skipped, 0 failed** (339 tests). One older unassignment test fixture was updated to issue an expiring token; accepting no-expiry credentials was the defect, not its business validation behavior.
- Focused regression: **11 passed**, covering session/token configuration, password-change enforcement/revocation, inactive wrong-password behavior, socket expiry, cookies, login throttling, security headers and CORS. A separate transaction test verifies password-update/revocation connection sharing, commit and rollback.
- New tests exercise valid/tampered/expired/wrong-algorithm/missing-expiry/invalid-sub tokens, cross-type misuse with separate and equal test keys, expired JWT/DB refresh records, concurrent refresh/replay, deleted/inactive users, current roles, logout/logout-all/password change, and production config failures. Fixture secrets are random at runtime; no real credentials are committed.
- `node tests/refreshRotation.mysql.smoke.mjs` passed against local MySQL: exactly one of two concurrent rotations won; forced insertion failure restored the original active row. Only newly created random, unusable token-hash rows were inserted and deleted; no user or existing session was changed.
- Existing isolated Edge cookie/CORS browser checks passed for login, reload with empty token memory, cookie refresh/rotation, authenticated API, logout/logout-all, exports, upload and readable failures. These use fixture persistence and are not a manual walkthrough with live user sessions.
- Existing client `refreshSession.smoke.mjs` and `refreshInterceptor.smoke.mjs` passed, covering single-flight 401 recovery/retry, exclusions, failure cleanup and 429 behavior. Expired-token 401 is tested on actual HTTP routes separately from the frontend interceptor's fixture-based retry test.
- Normal backend startup connected to MySQL and listened on temporary port 5100 with the new configuration checks. Backend has no lint/build script; unchanged client code required no build/lint run.

No forgot/reset-password routes were found or invented. No file-upload/Cloudinary hardening, full IDOR review, access blacklisting, broad secret audit or audit-log instrumentation was added. Existing cookie/CORS/rate-limit settings remain unchanged.

## Files changed

- `src/utils/jwt.js`, `src/server.js`, `.env.example`: claims and startup configuration.
- `src/middleware/authenticate.js`, `src/config/socket.js`, `src/modules/auth/auth.service.js`: user-state/password-change enforcement, socket expiry and login disclosure.
- `src/modules/auth/refreshToken.service.js`, `src/modules/auth/refreshToken.repository.js`: transactional rotation.
- `src/modules/users/user.repository.js`: optional transaction connection for password updates.
- New `tests/sessionSecurity.test.js`, `tests/refreshRotation.test.js`, `tests/refreshRotation.mysql.smoke.mjs`.
- New `tests/passwordSessionTransaction.test.js`: atomic password-change/session revocation regression.
- Updated `tests/helpers/cookieApp.js`, `tests/socket.test.js`, `tests/authCookie.test.js`, `tests/loginRateLimiter.test.js`, `tests/ticket.unassignConcurrency.test.js` fixtures and regressions.
- `SESSION_SECURITY.md`: this record.

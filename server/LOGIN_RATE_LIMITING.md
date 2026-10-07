# Phase 18.6 — Login rate limiting

## Policy

Reuses installed `express-rate-limit` **8.7.1** and the centralized factory/config style from Phase 18.5. A separate memory-store instance is mounted only on `POST /api/v1/auth/login`, before login validation and the controller. The general API limiter still runs first with its much larger budget.

Defaults in **development, test and production**: **5 failed requests per IP per 15 minutes**. Optional overrides in `.env.example` are `LOGIN_RATE_LIMIT_WINDOW_MS=900000` and `LOGIN_RATE_LIMIT_MAX=5`. Positive integer parsing rejects zero, negative, fractional, nonnumeric and overflowing strings. Windows above 24 hours and login quotas above 1,000 fall back to defaults. There is no environment-based disable switch.

Keys use the library's default Express IP handling and IPv6 /56 grouping. No email, body field or manually parsed forwarding header is used. `trust proxy` remains false; deployment behind a proxy requires explicit trusted topology configuration as documented in `RATE_LIMITING.md`.

## Counting semantics

`skipSuccessfulRequests: true` uses the installed library's default `statusCode < 400` success definition. Requests are initially counted, then successful responses are decremented on completion. This means:

- Wrong passwords and unknown users return the unchanged generic 401 and count equally.
- Existing inactive-user 403 responses and login-validation 422 responses count.
- A 200 login does not consume a failure, but does **not reset earlier failures**.
- Once exhausted, even correct credentials receive 429 until the window expires. Concurrent in-flight requests temporarily occupy quota; successful completion refunds only their own counts.
- JSON parser failures or oversized bodies rejected before the router remain covered by the general limiter, not this route-level limiter. Invalid email syntax in otherwise valid JSON reaches and consumes the login quota.
- Refresh, logout, logout-all, change-password and non-login routes have no strict login limiter. They retain the general budget and existing authorization behavior.

No database lockout, persistent failure columns, custom success-reset logic, account-specific denial policy or authentication-service change was introduced.

## Response and frontend

HTTP 429 returns:

```json
{
  "success": false,
  "message": "Too many login attempts. Please try again later.",
  "errors": []
}
```

The body contains no attempted email, IP, key or counter. The limiter provides `Retry-After`, with draft-8 `RateLimit` and `RateLimit-Policy` headers. The policy identifier is `login`, distinct from `api`; both policies appear on login responses. Legacy X-RateLimit headers remain off. The 429 is private/no-store and retains security headers. General exhaustion may instead return the existing general 429 message.

The Login page already uses `getLoginErrorMessage`; its shared safe-message allowlist now includes the exact login 429 message. Arbitrary server messages remain disallowed. Axios still refreshes only on 401, with login excluded; a login 429 is an ordinary inline error, not session expiry or a refresh trigger. No countdown, CAPTCHA or retry mechanism was added.

## Verification

- Full backend `node --test tests/*.test.js`: **331 passed, 1 skipped, 0 failed** (332 tests).
- New tests verify environment defaults and malformed config, successful-response discounting without resetting previous failures, expiry, real login validation/controller/service with real password hashing/comparison and fixture persistence/token boundaries, correct response/token/profile/cookie shape, wrong-password and nonexistent-user 401s, inactive 403s, malformed-email 422s, generic 429 body/headers, combined policy headers, and non-login routes after quota exhaustion. Tests use fresh local app/store instances.
- Live local backend on temporary port 5096: startup connected to MySQL successfully. A read-only lookup selected one existing active user's email without printing it. Three intentionally wrong-password requests returned 401; two requests for `nobody-supportflow@example.com` returned the same 401 message. The sixth request returned 429 with the exact login message and `Retry-After: 898`. Health still returned 200. No successful real-account session or database mutation was needed for this check; successful login was verified through the isolated integration test.
- Client `node tests/refreshSession.smoke.mjs` and `node tests/refreshInterceptor.smoke.mjs`: passed safe login-message parsing, refresh contracts and existing 429/401 behavior.
- Client `npm run build` and `npm run lint`: passed, retaining the existing large-bundle warning. Backend has no lint/build script.
- The temporary server was stopped after verification. Existing `.env` values were not changed.

To repeat locally with Postman, restart the development server for fresh counters, submit a known local email and an intentionally wrong password to `POST /api/v1/auth/login`, then repeat with `nobody-supportflow@example.com`. The first five failures on the same IP share the quota; request six returns 429. Use fresh state before testing correct credentials. Do not expect changing email alone to reset the IP quota.

## Storage and scope

Memory state is per server process and resets on restart. Multiple instances/workers need a shared store or coordinated ingress protection; no Redis or MySQL counters were added. Users behind one NAT share the login quota. IP-only throttling does not prevent distributed attacks.

No cookie attributes, JWT claims/signing/expiry/rotation, CORS, upload rules, permissions, email notifications or audit instrumentation changed. Existing request logging was not expanded and does not log request bodies/passwords.

Files changed: `server/src/middleware/rateLimiter.js`, `server/src/modules/auth/auth.routes.js`, `server/.env.example`, new `server/tests/loginRateLimiter.test.js`, this document, `client/src/api/apiError.js`, and `client/tests/refreshSession.smoke.mjs`. No dependency changes were needed.

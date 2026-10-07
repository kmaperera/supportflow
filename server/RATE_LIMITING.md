# Phase 18.5 — General API rate limiting

## Configuration

`express-rate-limit` **8.7.1** is installed and locked. No previous rate-limit package was present. The factory and safe config parser live in `src/middleware/rateLimiter.js`; `app.js` mounts one instance at `/api/v1`, after security/cache headers and CORS, before body parsing, authentication and routes. Existing body/upload limits are unchanged.

| Environment | Window | Requests per IP |
| --- | --- | --- |
| production | 15 minutes | 1,000 |
| test, unset or other | 15 minutes | 1,000 |
| development | 15 minutes | 5,000 |

Optional `API_RATE_LIMIT_WINDOW_MS` and `API_RATE_LIMIT_MAX` overrides are documented in `.env.example`. They must be positive decimal integers. Invalid values fall back to the environment defaults; windows above 24 hours and quotas above 1,000,000 are rejected to the defaults. Protection is never disabled by environment. Tests use small isolated overrides rather than changing the production policy.

The baseline accommodates Admin analytics' roughly a dozen parallel requests, dashboard/list navigation, 350 ms debounced search, and deduplicated notification events with a 150 ms REST-refetch debounce. It is a starting budget, not a measured guarantee for many users sharing one NAT address. Deployment should monitor and tune it for real traffic.

## Coverage and identity

- All API routes share the quota: health, auth (including login/refresh/logout), normal reads, mutations, uploads, exports and unknown API paths. Successful and failed requests count equally.
- Health remains protected because it performs a database query. A once-per-minute probe consumes 15 requests per window; unusually frequent monitoring should be adjusted or deliberately given a separate policy later.
- OPTIONS is explicitly skipped; current CORS middleware also answers preflights before the limiter. Root/non-API paths and any future static frontend assets outside `/api/v1` are not limited.
- Engine.IO `/socket.io/` handshakes and events do not run through this Express API limiter. Dedicated socket abuse controls are outside 18.5.
- The library's default IP key and IPv6 /56 subnet grouping are retained. No email, body/query field or caller-supplied bypass header is trusted. `trust proxy` remains Express's default **false**.
- Behind a future proxy, explicitly configure trusted proxy addresses/hops from the actual topology. Do not set `trust proxy=true` blindly. Until configured, traffic through a proxy shares its IP quota; forwarded headers cannot grant a different quota. Review this during deployment, not by weakening current local defaults.

## Responses and store

The limiter returns HTTP **429**, JSON content type, and:

```json
{
  "success": false,
  "message": "Too many requests. Please try again later.",
  "errors": []
}
```

Responses preserve security/CORS headers and use `Cache-Control: private, no-store`. There are no IPs, store keys, traces or internal errors in the body. The [library's standard header support](https://github.com/express-rate-limit/express-rate-limit) is configured with `standardHeaders: 'draft-8'`, producing `RateLimit` and `RateLimit-Policy`; legacy X-RateLimit headers are disabled. The library supplies accurate `Retry-After` on blocked requests. No CORS exposed-header policy was changed; current UI does not read these headers cross-origin.

The default memory store is **per process**, resets on restart, and is not coordinated across replicas/workers. A distributed deployment requires a shared store (or coordinated ingress policy). No Redis, MySQL counter table, audit writes, CAPTCHA, per-route micro-limits or per-user tiers were added.

## Frontend compatibility

The Axios interceptor already only starts recovery for 401. A discovered edge case cleared the session when that recovery request returned 429. It now rejects the 429 without clearing the existing session or replaying the failed request. Concurrent 401 recovery remains single-flight, and genuine authentication failures retain existing cleanup behavior. Startup restoration displays the ordinary rate-limit message and finishes initialization without claiming session expiry or revoking cookies. A later user request can retry; no automatic countdown/retry loop was added.

TanStack Query is installed but no QueryClient/useQuery retry machinery is active in current source. Search and notification debounce behavior is unchanged. This is a small 429 error-handling adjustment, not a token/session architecture change.

## Verification

- Focused limiter tests: settings/fallbacks, below/above threshold, shared route budget, JSON shape, standard headers, Retry-After, no-store, OPTIONS skip, non-API exclusion, caller-header non-bypass, window expiry, and actual-app ordering before malformed JSON parsing.
- Existing security-header tests: successful health/auth fixtures, CSV/PDF/attachment response bytes and headers, real Socket.IO polling/WebSocket notification delivery all passed with the limiter mounted.
- Full backend `node --test tests/*.test.js`: **328 passed, 1 skipped, 0 failed** (329 tests). Covers existing ticket/comment/assignment, dashboard, user-related validation, reports/downloads, notification, upload and other regressions. These are automated tests with fixture boundaries, not a new manual walkthrough of every authenticated workflow.
- `node tests/refreshInterceptor.smoke.mjs`: passed direct 429 passthrough, concurrent refresh 429/session preservation, subsequent authentication failure cleanup and existing recovery behavior.
- Client `npm run build` and `npm run lint`: passed; build retains the existing large-chunk warning. Backend has no lint/build script.
- Backend `npm start` on temporary local port 5095: MySQL connection and listening succeeded. With process-only overrides `API_RATE_LIMIT_MAX=3`, `API_RATE_LIMIT_WINDOW_MS=60000`, four sequential health requests returned **200, 200, 200, 429**; the last response contained the documented body and `Retry-After: 60`. No saved `.env` values changed and no external infrastructure was load-tested.
- No fresh manual successful login, ticket creation, assignment or other account mutation was performed. Production thresholds were not stress-tested. Socket transport behavior was tested with real local client/server connections and fixture authentication.

Dependency installation reported 8 dependency audit findings (2 moderate, 5 high, 1 critical); no unrelated dependency upgrades or `npm audit fix` were applied in this phase.

## Files and boundaries

Changed: `server/package.json`, `server/package-lock.json`, `server/.env.example`, `server/src/app.js`; added `server/src/middleware/rateLimiter.js`, `server/tests/rateLimiter.test.js`, and this document. The targeted frontend change touches `client/src/api/axios.js`, `client/src/auth/AuthProvider.jsx`, and `client/tests/refreshInterceptor.smoke.mjs`.

Dedicated login brute-force limits, failed-attempt accounting and successful-login resets are **not** implemented; they belong to 18.6. Cookie attributes, CORS policy, JWT lifetimes/rotation, file/Cloudinary restrictions, IDOR rules and audit instrumentation remain unchanged.

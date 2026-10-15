# Phase 20.5 — Vercel backend preparation

No deployment has been performed. Set project root to `server/` and use a supported Node runtime satisfying package engines. No Vercel URLs or individual API function wrappers are hardcoded.

## One HTTP server

Root `server/server.js` is the deployment entry and exports `src/httpServer.js`. Its explicit Express import satisfies static framework detection; root server precedes `src/app.js` in the documented Node entry discovery order. `httpServer.js` loads/validates runtime configuration and creates one HTTP server with the Express app and Socket.IO attached. Requiring it does not call listen, run migrations/seeds, or issue a DB readiness query. HTTP health performs the DB check on demand.

`npm start` / `npm run dev` still use `src/server.js`, which imports that same singleton, checks DB connectivity, and listens on `0.0.0.0` using PORT (5000 fallback). Module caching and existing socket initialization guards prevent duplicate Socket.IO instances.

With Framework Preset Other, the deployed project did not produce a routable backend through automatic discovery (platform NOT_FOUND for root and health). `server/vercel.json` now explicitly builds `server.js` with `@vercel/node` and routes every path to that single exported HTTP server, preserving the original request path. This includes `/`, `/api/v1/*`, and `/socket.io/*` upgrade requests. No dist/output directory, individual API handlers, or Express-only wrapper is introduced. Explicit builds take precedence over automatic build discovery; keep project root server/ and no output-directory override. A redeploy is required. Check that build output contains a Node function for server.js, then verify public root/health and authenticated websocket transport. Local checks cannot establish a deployed response before redeployment.

Sources: [Vercel entry discovery](https://github.com/vercel/vercel/blob/main/skills/vercel-cli/references/node-backends.md), [HTTP-server Socket.IO example](https://github.com/vercel/examples/blob/main/websockets/express-socketio/src/server.ts).

## Realtime is best effort

Production frontend builds use `transports: ['websocket']` with reconnection enabled. Local development retains Socket.IO's default transports. Reconnect triggers REST notification reconciliation; window refocus now does too. List/navigation/manual retry also fetch authoritative persisted notifications. Duplicate socket messages are only a UI optimization.

MySQL stores notifications before emission. No data is lost merely because an emission fails or reaches an instance without the recipient socket. Socket rooms and emissions remain process-local: cross-instance delivery is **not guaranteed**, and a connected foreground inbox may remain stale until refocus, reconnect, navigation, or refresh. There is no Redis, adapter, or paid realtime dependency. This is an accepted portfolio limitation, not globally coordinated realtime. Vercel can close sockets at Function duration limits and reconnect to another instance; authentication and user-room membership are recreated on each connection. Existing access-token expiry disconnects also require the existing auth token renewal/resubscription behavior.

Source: [Vercel WebSocket lifecycle/transport](https://vercel.com/docs/functions/websockets).

## Recovery email lifecycle

Forgot-password now awaits lookup, token issuance, email delivery, and failure cleanup inside the HTTP request. It returns the same HTTP 200 generic body for known, unknown/inactive users and internal delivery failures. Raw SMTP errors, reset links, and tokens are never logged. A failed send invalidates only that attempt's token; cleanup failure is logged generically and cannot be made atomic with remote SMTP. Requests must fit platform/SMTP timeout budgets; client timeouts do not prove delivery failed.

Awaiting SMTP introduces timing differences between known and unknown accounts; identical response bodies/statuses do not guarantee timing indistinguishability. No durable queue or constant-time delivery architecture was introduced. Rate limits remain important. Admin reset already awaited delivery. The old drainPendingRequests export remains a no-op compatibility hook for test cleanup; there is no pending in-process queue.

The remaining backend timer is per-socket token-expiry cleanup, tied to the open connection and cleared on disconnect. asyncHandler promises are returned to Express. No other detached mail or post-response tasks were found. No recurring SLA scheduler exists: calculation/warning helpers do not establish scheduled warning/breach automation, and no scheduler was added.

## Proxy, limits, and database

Only when `VERCEL=1` **and** `NODE_ENV=production`, Express trusts one immediate proxy hop before rate limiting/routes. Vercel documents that it overwrites X-Forwarded-For with the connecting client's IP. This scopes trust to platform runtime rather than trusting arbitrary forwarding headers in local/traditional deployments. Do not set VERCEL manually on an exposed non-Vercel server. Additional upstream proxies or enterprise custom forwarding require reassessment. Validate IP/protocol behavior on the eventual deployment.

This policy supplies req.ip for rate limiting and audit metadata. Cookie Secure still derives directly from NODE_ENV; SameSite/domain decisions remain unchanged and must match final frontend/API topology. Source: [Vercel forwarded headers](https://vercel.com/docs/headers/request-headers).

Limiters remain process-instance-local, reset on restart, and are best effort across Fluid instances. No Redis added. DB_POOL_LIMIT now defaults to 5 and accepts integers 1–10; override for local/deployment budgets. Transactions acquire one connection and release it normally; five allows bounded concurrency without changing SQL. Total connections are this limit multiplied by active instances, plus maintenance connections. TiDB SSL/identity verification remains enabled through DB_SSL=true and optional DB_SSL_CA. No schema/seed changes.

## Verification and release gates

Tests exercise singleton HTTP export, no import-time listener, websocket-only authentication/room joining, health, awaited mail completion/failure invalidation, generic public responses, auth cookies/login/refresh, persistence despite failed realtime, REST recovery, production socket options, reconnect/refocus cleanup, proxy scope and pool bounds. Live TiDB verification is limited to SELECT 1 through local startup/health; no test users, resets, notifications, migrations, or seeds are written to production.

Before release configure production secrets/origin/email, verify selected Vercel runtime/build entry, Function duration and payload limits (especially 10 MB uploads), TiDB aggregate connections/networking, cookie behavior, SMTP delivery, proxy IPs, and socket reconnect. Real production account authentication was not exercised; isolated auth fixtures cover regression behavior without modifying production data. Cross-instance realtime and rate-limit guarantees remain explicitly out of scope. Phase 20.6 has not begun.

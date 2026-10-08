# Phase 18.8 — CORS review

## Before and after

Previously Express passed `CLIENT_URL` directly as a fixed CORS origin, enabled credentials, allowed GET/POST/PUT/PATCH/DELETE/OPTIONS and Content-Type/Authorization, and used the library's 204 preflight default. It exposed no response headers. Socket.IO separately trimmed CLIENT_URL, rejected missing/wildcard values and enabled credentials. It had no handshake origin gate beyond CORS.

The frontend's `reportExportApi.js` reads `response.headers['content-disposition']`; without exposure a cross-origin browser could not use the server filename. Socket.IO WebSocket connections also needed explicit origin enforcement because WebSockets are not governed by browser CORS.

`src/config/cors.js` now centralizes the policy for both Express and Socket.IO:

- **One configured frontend origin**, using existing `CLIENT_URL`. Trim surrounding whitespace and normalize a root trailing slash through URL parsing. Only HTTP(S) origins are valid; reject wildcards, credentials, non-root paths, queries and fragments. Request Origin strings are compared exactly against the normalized configured origin, never by substring or suffix.
- Production requires valid CLIENT_URL and fails startup otherwise. Missing non-production configuration falls back explicitly to `http://localhost:5173`, matching the local workflow. Invalid nonempty configuration fails in every environment. No staging domains, multiple-origin variable, Cloudinary domains, localhost port wildcard, LAN ranges or automatic 127.0.0.1 alias were added.
- Allowed browser origins receive their exact origin, `Access-Control-Allow-Credentials: true` and `Vary: Origin`. REST requests with no Origin continue normally with no CORS permission headers; Postman/curl still require normal authentication.
- Disallowed or literal `null` REST origins receive no ACAO/ACAC; they do not produce a CORS-specific 500. The server may still execute a simple request: this policy controls browser response access, not API authentication or complete CSRF protection.
- REST methods remain GET, POST, PUT, PATCH, DELETE, OPTIONS. Existing feedback routes use PUT, so it remains necessary. Allowed request headers remain Content-Type and Authorization. The browser sets multipart boundaries; no upload content-type override was introduced.
- **Content-Disposition is exposed**, as required by export filename handling. RateLimit/Retry-After are not exposed because current UI does not consume them. Set-Cookie remains browser-managed and unreadable by JS.
- Allowed preflights end with **204** before auth, rate limiting or business routes. OPTIONS still does not consume the API quota. CORS remains before parsers/routes so allowed clients can read error responses too.

## Socket.IO

The same exact-origin callback is used for polling CORS with credentials enabled, matching the client's existing `withCredentials`. Socket polling methods are explicitly GET/POST. An `allowRequest` callback rejects handshakes whose Origin is present but not allowed, covering direct WebSocket connections as well as polling. Missing-Origin clients remain allowed to attempt authentication; Origin is spoofable outside browsers and is not a substitute for the unchanged JWT/user checks and private rooms.

The relevant behavior follows [Socket.IO's CORS guidance](https://socket.io/docs/v4/handling-cors) and the [Express CORS middleware options](https://expressjs.com/en/resources/middleware/cors/). No event contracts or authentication logic changed.

## Credentials, topology and CSRF

Axios credentials and VITE_API_BASE_URL are unchanged. Local frontend localhost:5173 and API localhost:5000 are cross-origin but same-site. Refresh cookie HttpOnly, Secure environment handling, Lax, host-only domain and auth path remain unchanged. Production must set CLIENT_URL to the actual frontend origin and use HTTPS.

This change does **not** convert CORS into authentication or a CSRF firewall. Disallowed simple form requests may still execute even if their responses cannot be read. SameSite=Lax reduces cross-site cookie-bearing POST exposure, but same-site sibling origins and login CSRF remain concerns described in `SECURE_COOKIES.md`. A genuinely cross-site production frontend/API would require a deliberate cookie/CSRF design, not merely a new CORS origin. No SameSite weakening or CSRF library was added here.

## Verification

- `node --test tests/*.test.js`: **334 passed, 1 skipped, 0 failed** (335 tests). Includes attachment/download/export, authentication/rate-limit and application workflow regressions.
- New `tests/cors.test.js` verifies production configuration rejection, whitespace/trailing slash handling, exact origins, null/evil/other-port/loopback-alias denial, allowed preflights and methods, narrow headers, quota-free OPTIONS, no-Origin requests, readable 401/403/404/429/500 responses, and real Socket.IO polling/WebSocket connections. Both transports delivered a notification for the allowed origin and rejected the unauthorized origin even with a valid fixture token. Existing socket tests continue checking trusted identities.
- The existing isolated browser script `tests/authCookie.cdp.mjs` was extended: actual browser credentialed login/reload/refresh/rotation/authenticated API/logout/logout-all passed; real CSV/PDF exports exposed readable Content-Disposition filenames; browser-generated multipart with Authorization succeeded through the real upload parser/validator/controller (storage stubbed); login 429 was readable; a different loopback-origin page could not read the API response.
- The browser harness uses localhost ports 5197/5097 and isolated memory persistence, not production accounts or live Cloudinary storage. Downloads/Cloudinary service contracts are covered by existing automated tests. No new manual walkthrough of every Employee/Technician/Admin page was performed.
- Existing frontend `refreshInterceptor.smoke.mjs` and `refreshSession.smoke.mjs` passed, verifying Axios refresh/retry and credential contracts. The browser harness tests cross-origin cookie refresh directly; it does not claim a full React expired-token navigation walkthrough.
- Normal backend `npm start` on temporary port 5099 connected to MySQL. Live local health probes returned 200: localhost:5173 received exact ACAO, ACAC=true and Content-Disposition exposure; https://evil.example received none of those headers. Authorization preflight returned 204 and the expected allowed headers.
- Backend has no lint/build script. Client source/config did not change, so no frontend build/lint was required. Temporary servers/browser were shut down after verification.

## Files changed and boundaries

Production: `server/src/config/cors.js` (new), `server/src/app.js`, `server/src/config/socket.js`, `server/.env.example`.

Tests/docs: `server/tests/cors.test.js` (new), `server/tests/socket.test.js`, `server/tests/authCookie.cdp.mjs`, `server/tests/helpers/cookieApp.js`, and this document.

No JWT signing/expiry/claims/rotation, cookie attributes, file MIME/extension policy, Cloudinary restrictions, permission rules, new audit subsystem, dependencies or client API architecture changes were introduced.

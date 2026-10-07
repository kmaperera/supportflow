# Phase 18.4 — Helmet and security headers

## Configuration and scope

Installed Helmet: **8.3.0**, confirmed from the installed package and implementation, with the [official reference](https://helmet.js.org/) checked for configuration behavior. Previously `app.js` mounted unconfigured `helmet()` first. It now mounts the centralized `middleware/securityHeaders.js` first; existing CORS, parser, cookie, logging, route and error-handler ordering is preserved. Sensitive cache policy runs before parsers so malformed requests receive it too.

Express serves JSON and file/report downloads. No SPA build, HTML page, email preview or docs renderer is mounted. React/Vite is a separate origin. Searches found no frontend iframe/object/embed usage or camera, microphone, geolocation, payment or USB APIs. No OAuth popup flow is present.

## Before and after

Before edits, HTTP responses were captured from the real app's health and authenticated `/api/v1/auth/me` routes, using a fixture identity instead of live account credentials. Auth/me returned 200; the initial health probe returned 500 because that isolated process had no database configuration. Both carried the same default Helmet headers. After changes, a normally started backend with MySQL returned health 200; integration tests also verify successful health and authenticated responses.

| Header | Before | After |
| --- | --- | --- |
| Content-Security-Policy | Helmet defaults, including self sources, broad HTTPS font/style sources, inline styles and upgrade-insecure-requests | `default-src 'none';base-uri 'none';form-action 'none';frame-ancestors 'none'` |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains`, all environments | Production only: `max-age=31536000`; absent otherwise |
| X-Frame-Options | SAMEORIGIN | DENY, consistent with frame-ancestors none |
| Permissions-Policy | Absent | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| Cache-Control | Generally absent; attachment downloads already private/no-store | `private, no-store` on all current auth/protected API module prefixes |
| X-Content-Type-Options | nosniff | Unchanged |
| Referrer-Policy | no-referrer | Unchanged, intentional privacy choice |
| Cross-Origin-Opener-Policy | same-origin | Unchanged |
| Cross-Origin-Resource-Policy | same-origin | Unchanged |
| Cross-Origin-Embedder-Policy | Absent | Remains disabled |
| Origin-Agent-Cluster | ?1 | Unchanged |
| X-DNS-Prefetch-Control | off | Unchanged |
| X-Download-Options | noopen | Unchanged |
| X-Permitted-Cross-Domain-Policies | none | Unchanged |
| X-XSS-Protection | 0 | Unchanged; legacy filtering is not enabled |
| X-Powered-By | Absent | Still absent through Helmet |

No duplicate/conflicting policy was introduced. The attachment controller's existing nosniff and private/no-store values agree with the shared middleware and are retained for standalone controller safety.

## Policy decisions

- **CSP:** A small API-only deny policy avoids irrelevant CDN/HMR/Cloudinary allowances, unsafe-inline, unsafe-eval and wildcard sources. No report-only telemetry or collector was added. API response CSP does **not** protect the separately served React document or control its fetches. A frontend-host policy must be designed and delivered there, with actual API/socket origins and the existing theme startup script accounted for.
- **HSTS:** Only `NODE_ENV=production` enables one-year HSTS. Production must use HTTPS at the serving proxy. Neither preload nor includeSubDomains is enabled because ownership/HTTPS readiness of all subdomains has not been established. Local HTTP gets no HSTS or upgrade-insecure-requests directive. No trust-proxy setting was changed.
- **Framing:** DENY and frame-ancestors none agree. These protect backend responses, not a separately hosted frontend document.
- **COOP/CORP/COEP:** Keep same-origin opener/resource defaults and no COEP. Existing attachments/reports are fetched through authenticated CORS requests and locally created Blob downloads; no global CORP weakening is needed. Cloudinary's own response headers are outside Express. Engine.IO handles `/socket.io/` outside Express middleware; no new header hook or transport/CORS change was added.
- **Permissions:** Deny the five unused features on backend responses. As with CSP, frontend document policy belongs at its own host.
- **Caching:** Auth, users, tickets, notifications, SLA, KB, dashboard, reports and audit-log prefixes receive private/no-store, including errors and token-bearing auth responses. All current KB reads require authentication. Public root and health responses are not blanket-disabled. No static serving behavior changed. Revisit this explicit prefix list when adding a new sensitive API module.
- **MIME/downloads:** Existing JSON, CSV, PDF and attachment Content-Type/Content-Disposition values remain authoritative; no controller MIME override was added.

## Verification

- `node --test tests/*.test.js`: **325 passed, 1 skipped, 0 failed** (326 tests). Existing upload, Cloudinary service mocks, report, notification and other backend regressions included.
- `node --test tests/securityHeaders.test.js`: **2 passed**, rerun after adding actual CSV/PDF/attachment route header and byte assertions. Uses the real app/router/Helmet and local HTTP, fixture auth/database/storage boundaries, and real Socket.IO client/server connections. Checks polling and WebSocket notification delivery, dev/test/production configuration, successful auth/me, health, missing auth, login validation, missing refresh cookie, malformed JSON, 404s, no-store and absence of disclosure/conflicting headers.
- `npm start` on temporary port 5094: successful MySQL connection and listening state. `Invoke-WebRequest http://localhost:5094/api/v1/health -UseBasicParsing` returned 200 with the headers above.
- `TEST_API_URL=http://localhost:5094/api/v1 node tests/authCors.smoke.mjs`: passed existing login/refresh/change-password negative requests and preflight contracts. No real user's session was created or rotated.
- Backend has no lint script or build step. No frontend source/config changed, so no frontend build/lint was needed.
- Live Cloudinary uploads/downloads, successful real-account login/refresh and a fresh Light/Dark browser walkthrough were **not** performed. Upload/cloud transfer paths are covered by existing mocked tests; frontend theme files and frontend response headers are untouched. This is not a claim of a full production deployment test.

## Deployment follow-up

Configure CSP, frame protection and Permissions-Policy at the actual frontend host. Confirm HTTPS termination and desired HSTS scope at the production proxy/CDN; avoid app/proxy conflicting duplicate values. If Express later serves HTML, review the API-only CSP before deploying that change. These deployment checks were documented, not applied to an unknown hosting environment.

Files changed: `src/app.js`, new `src/middleware/securityHeaders.js`, new `tests/securityHeaders.test.js`, and this document. No business logic, schema, rate limiting, CORS policy, cookies, JWT/session settings, upload restrictions, Cloudinary restrictions, authorization or audit subsystem changes were made.

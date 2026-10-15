# Production environment preparation — Phase 20.2

Phase 20.3 follow-up: see [production MySQL setup and verification](MYSQL_PRODUCTION.md). Provisioning and live production tests remain pending provider account access; no migrations or seeds have been run.

Phase 20.2 prepares configuration only. No hosting, production database, migration, seed, credentials, DNS, or external deployment has been created. Phase 20.3 has not begun. See [the Phase 20.1 architecture plan](DEPLOYMENT_PLAN.md) for deployment order and rollback; its findings describe the pre-20.2 snapshot. The MySQL TLS gap and missing Node engines identified there are addressed below.

## Environment inventory

Real `server/.env` and `client/.env` remain unchanged and untracked. `.gitignore` covers `.env`, `.env.*` (including local/production variants), excludes build output, coverage, logs, temporary files, caches and private keys, and explicitly permits `.env.example`. Do not commit actual CA/config secrets, generated exports, or credential-bearing screenshots. The tracked image asset is intentional; no generated PDF/CSV/log export was found tracked. Avoid blanket PDF/CSV/image ignores that could hide legitimate fixtures or assets.

All variables below are backend runtime settings except `VITE_API_BASE_URL`, which is frontend build-time PUBLIC. Values in examples are development defaults or placeholders, never production credentials.

| Classification | Variables | Notes |
| --- | --- | --- |
| REQUIRED for production | `NODE_ENV`, `CLIENT_URL` | Set production and the exact final HTTPS frontend origin. Production rejects missing/invalid origin; HTTPS is an operator requirement. Development-only origin fallback: localhost:5173. |
| OPTIONAL | `PORT` | Platform-supplied integer 1–65535; local fallback 5000. |
| REQUIRED | `DB_HOST`, `DB_USER`, `DB_NAME` | Server-only infrastructure/account configuration. |
| REQUIRED SECRET | `DB_PASSWORD` | No credential fallback. |
| OPTIONAL | `DB_PORT` | Default 3306; validated numeric port. |
| OPTIONAL | `DB_SSL` | Strict string true/false; default false for local compatibility. Set true for encrypted remote MySQL when required. |
| OPTIONAL server-only | `DB_SSL_CA` | Provider PEM CA bundle, actual newlines or literal `\n`; requires DB_SSL=true. Certificate content is not a private key, but keep provider configuration out of frontend/Git. |
| REQUIRED SECRET | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Distinct random production values of at least 32 characters; unsafe/missing values fail startup. |
| REQUIRED | `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Positive finite durations; refresh must exceed access (example 15m / 7d). |
| REQUIRED backend-only | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` | Required by startup; never supplied through VITE variables. |
| REQUIRED SECRET | `CLOUDINARY_API_SECRET` | Required by startup. |
| OPTIONAL group; REQUIRED for recovery | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `EMAIL_FROM_ADDRESS` | All required if any email group member is configured. Verify sender identity and provider connectivity later. |
| OPTIONAL group SECRET | `SMTP_PASS` | Required when email group is enabled; preserved exactly. |
| OPTIONAL | `SMTP_SECURE`, `EMAIL_FROM_NAME` | Strict true/false, default false; name defaults SupportFlow. Match SMTP port/TLS mode to provider. No implicit truthiness parsing. |
| OPTIONAL | `PASSWORD_RESET_TTL_MINUTES` | Default 15; integer 5–30. |
| OPTIONAL security limits | `API_RATE_LIMIT_WINDOW_MS`, `API_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_WINDOW_MS`, `LOGIN_RATE_LIMIT_MAX` | Validated bounded positive integers with safe fallbacks; process-local stores. See architecture plan for quotas. |
| Bootstrap-only REQUIRED | `INITIAL_ADMIN_FIRST_NAME`, `INITIAL_ADMIN_LAST_NAME`, `INITIAL_ADMIN_EMAIL` | Used only by seed:admin, not normal startup. |
| Bootstrap-only SECRET | `INITIAL_ADMIN_PASSWORD` | Unique strong temporary value; forced change on first login; remove after bootstrap. No seed executed in this phase. |
| REQUIRED PUBLIC build config | `VITE_API_BASE_URL` | Full API base ending `/api/v1`; HTTPS production URL. Rebuild when changed. |

No separate Socket.IO variable is needed: the frontend intentionally derives its backend origin from the API base and uses default `/socket.io/`. Express and Socket.IO share CLIENT_URL. Reset emails derive `/reset-password` from the same trusted origin. No production-sensitive localhost hardcoding required changes: the backend localhost URL is development-only, Axios's synthetic `http://supportflow.local` base is only a URL parser fallback, and SVG HTTP namespaces are identifiers, not network destinations.

## MySQL verified TLS

`DB_SSL=false` (or unset) preserves local connections. `DB_SSL=true` passes mysql2 TLS options with `rejectUnauthorized:true`, `verifyIdentity:true`, and minimum TLS 1.2. With no CA bundle, Node's trusted roots apply; set DB_SSL_CA if the provider supplies a private/custom CA. Use the provider DNS hostname matching its certificate. Never set verification false. The helper validates PEM certificates and boolean configuration before startup; errors show variable names, not values. Seeds use the same pool/helper. A selected provider's live TLS connection and certificate failure behavior must be tested in Phase 20.3; this phase does not claim that remote test.

Pool limits remain 10 connections, waiting enabled, unlimited queue, and multiple statements disabled. There is no new pool tuning or TLS enforcement for localhost. Production operators must explicitly enable DB_SSL when the network/provider requires it.

## Runtime and build

Both manifests and lockfile root metadata now declare Node >=22.12.0, compatible with the installed Vite constraint and local Node 22.18.0. Lockfile dependency resolutions were not regenerated. Pin a supported matching Node release in the selected deployment platform later.

- Backend: from server/, `npm ci --omit=dev`, then `npm start` (plain Node src/server.js). Development remains `npm run dev` with nodemon. Runtime imports are declared in dependencies; test-only Socket.IO client and nodemon remain dev dependencies.
- Frontend: from client/, `npm ci` including build tools, then `npm run build`; publish dist/. React/Vite/Tailwind/Axios dependencies are declared. Production source maps are not enabled by Vite config.
- No destructive npm ci reinstall was performed over the active development environment; both tracked lockfiles and their root metadata were inspected instead.
- Frontend host must serve index.html for unknown SPA routes including reset-password and role routes, without rewriting API/socket traffic. Vite preview is not proof of the eventual host's routing rules. Configure/retest in Phase 20.6.

## Existing security behavior retained

Secure refresh cookies are enabled by NODE_ENV=production, HttpOnly and host-only with `/api/v1/auth` path. SameSite stays Lax; final domain/cross-site choices are deferred to Phase 20.11. Prefer same-site HTTPS subdomains. CORS remains exact-origin and credentialed with one shared REST/socket policy. No proxy trust was enabled blindly; selected-host forwarding/IP/rate-limit/audit behavior still needs configuration later.

JWT validation, required database/Cloudinary validation, reset TTL validation, production HSTS, sanitized errors without response stacks, and request logging without body/header/query credentials remain unchanged. SMTP is optional at startup, but missing email is not acceptable for a deployment exposing recovery/Admin reset. No SMTP/Cloudinary delivery probes or external credential creation occurred.

## Verification and remaining gates

- Backend: configuration/TLS tests cover disabled TLS, strict boolean parsing, verified TLS flags, system/provider CAs, malformed CA rejection and safe errors; existing env tests cover startup validation, mail configuration, and sanitized request logging.
- `npm start` was run on an isolated free local port with existing local env. MySQL connected; GET /api/v1/health returned 200 with database UP. The owned process tree was stopped afterward. No local env edits, migrations, or seeds were performed.
- Backend has no npm test or lint script; targeted node:test checks were run directly. No scripts were invented just to satisfy commands.
- Frontend build and lint passed; build output is client/dist with the existing large-bundle warning. Existing change-password, recovery, and profile smoke scripts passed.
- Production-mode startup remains a static review: no substitution of real local secrets or forced Secure-cookie testing over local HTTP. Local development startup does not prove production TLS/CORS/cookie behavior.

Ready to begin Phase 20.3 preparation: yes. Remaining later-phase gates are actual provider MySQL/TLS compatibility and network access, schema/seeds, backend/static hosting, trusted proxy configuration, final CORS/cookie domains, verified SMTP/Cloudinary, SPA fallback, persistent sockets, and deployed workflows. None is represented as already deployed or tested remotely.

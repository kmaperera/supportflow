# SupportFlow production deployment

This guide describes the final production architecture and checked-in deployment configuration. Earlier phase plans are historical snapshots. Never store credentials, signing keys, SMTP keys, passwords, cookies or reset tokens in Git, documentation, screenshots or logs.

## Architecture and production URLs

| Component | Provider and responsibility | Endpoint |
| --- | --- | --- |
| React/Vite frontend | Vercel static hosting, assets, SPA routes, public TLS | https://supportflow-bao6.vercel.app |
| Express/CommonJS backend | Vercel Node Functions/Fluid Compute, API, auth, Socket.IO | https://supportflow-iota.vercel.app |
| Database | TiDB Cloud Starter, MySQL-compatible persistent records | Database `supportflow_prod`; gateway/credentials are private configuration |
| File storage | Cloudinary authenticated attachment assets | Authorized backend download routes |
| Email | Brevo SMTP with Nodemailer | Backend-configured transactional transport |
| Realtime | Socket.IO on the shared backend HTTP server | `/socket.io/`, websocket-only production clients |

The browser loads static assets from the frontend and calls the backend over HTTPS/WSS. The backend connects to TiDB over verified TLS, streams uploads/downloads through Cloudinary, and sends recovery email through Brevo. Vercel does not initialize the schema or verify secret correctness. Operators manage grants, backups, sender verification, quotas and release checks.

## Runtime and deployment steps

Both packages declare Node >=22.12.0; choose a supported compatible Node version in Vercel and use committed lockfiles. Prior local verification used Node 22.18.0.

### Backend project

1. Set Root Directory to `server/`, Framework Preset to **Other**, and leave Output Directory unset. There is no `dist` build for this CommonJS backend.
2. Install dependencies normally (reproducibly with `npm ci`; production-only installs may use `npm ci --omit=dev`). Configure the backend Production env inventory below before deployment.
3. Deploy the reviewed revision. `server/vercel.json` explicitly builds root `server.js` using `@vercel/node` and routes `/(.*)` to `/server.js`, including API and socket upgrade traffic.
4. Root `server/server.js` exports `src/httpServer.js`, the singleton HTTP server containing Express and Socket.IO. Importing it does not listen or run schema/seeds. Do not export Express alone or split routes into individual API functions.
5. Confirm a Node function is present in deployment output. Check `/` and `/api/v1/health`, then authenticated endpoints and WebSocket upgrades. Health runs SELECT 1; it does not establish schema, SMTP or Cloudinary readiness.

Local commands from `server/` remain `npm run dev` (Nodemon) and `npm start` (plain Node `src/server.js`). Local startup tests DB connectivity and listens on `0.0.0.0` using PORT, fallback 5000. Production env changes require redeployment. No migration or seed runs automatically.

### Frontend project

1. Use a separate project rooted at `client/`, Framework Preset **Vite**, install `npm ci`, build `npm run build`, output **dist**. Include dev dependencies for build tools.
2. Set public `VITE_API_BASE_URL` to the production backend origin from the table plus `/api/v1`, without a trailing slash. Configure it before building; values are embedded into assets.
3. Preserve `client/vercel.json`: existing files first, then frontend fallback to `/index.html`, excluding `/api` and `/socket.io`. No frontend API proxy exists.
4. Verify direct refresh on `/login`, `/forgot-password`, `/reset-password`, `/employee/*`, `/technician/*` and `/admin/*`, including harmless reset query parameters. Verify assets are served normally and API errors are not HTML.

Local `npm run dev` remains unchanged. Build/lint commands are `npm run build` and `npm run lint`. Vite preview is useful locally but does not prove deployed routing. Changing the API URL requires a rebuild; changing local `.env` alone does not change Vercel.

## Production environment inventory

Names and placeholders only are listed here. Use provider-managed secrets; do not copy a local development template unchanged. Real `.env` files and build output are ignored; `.env.example` files are tracked.

### Backend runtime variables

| Name | Classification / behavior |
| --- | --- |
| `NODE_ENV` | Required operational setting: production. Absence is not rejected, so verify explicitly. |
| `CLIENT_URL` | Required in production: exact HTTPS frontend origin in the table. Shared CORS/reset-link source. |
| `DB_HOST` | Required backend-only `<tidb-gateway-hostname>` matching provider certificate. |
| `DB_PORT` | TiDB port 4000; local code default 3306. |
| `DB_USER` | Required backend-only `<dedicated-application-user>`. |
| `DB_PASSWORD` | Required secret `<database-password>`. |
| `DB_NAME` | Required production container `supportflow_prod`. |
| `DB_SSL` | Enable with literal true for TiDB; local-compatible default false. |
| `DB_SSL_CA` | Optional provider PEM CA bundle; supports actual newlines or escaped newline sequences. Requires TLS. |
| `DB_POOL_LIMIT` | Optional integer 1?10; default 5 connections per instance. |
| `JWT_ACCESS_SECRET` | Required secret `<independent-random-access-signing-secret>`. |
| `JWT_REFRESH_SECRET` | Required secret `<independent-random-refresh-signing-secret>`. |
| `JWT_ACCESS_EXPIRES_IN` | Required `<positive-access-duration>`. |
| `JWT_REFRESH_EXPIRES_IN` | Required `<positive-refresh-duration-longer-than-access>`. |
| `CLOUDINARY_CLOUD_NAME` | Required backend-only `<production-cloud-name>`. |
| `CLOUDINARY_API_KEY` | Required backend-only `<production-api-key>`. |
| `CLOUDINARY_API_SECRET` | Required secret `<production-api-secret>`. |
| `SMTP_HOST` | Required for email: `<brevo-smtp-relay-host>`. |
| `SMTP_PORT` | Required for email: `<provider-port>`. |
| `SMTP_USER` | Required backend-only `<brevo-smtp-login>`. |
| `SMTP_PASS` | Required email secret `<brevo-smtp-key>`, not API key/account password. |
| `SMTP_SECURE` | Optional strict true/false; select according to transport port. |
| `EMAIL_FROM_ADDRESS` | Required for email: `<verified-sender-address>`. |
| `EMAIL_FROM_NAME` | Optional sender display name; default SupportFlow. |
| `PASSWORD_RESET_TTL_MINUTES` | Optional integer 5?30; default 15. |
| `PORT` | Optional/platform port for local/traditional listener; fallback 5000. |
| `API_RATE_LIMIT_WINDOW_MS` | Optional bounded positive integer; default 900000 ms. |
| `API_RATE_LIMIT_MAX` | Optional; production default 1000 requests per window/instance. |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | Optional; default 900000 ms. |
| `LOGIN_RATE_LIMIT_MAX` | Optional; default 5 failed requests per window/instance. |
| `VERCEL` | Platform-managed flag; value 1 gates production proxy trust. |

Email may be entirely absent for startup, but production recovery requires the complete group. Partial configuration fails validation. Ports must be integers 1?65535; SMTP/DB booleans parse literal true/false; pool/reset limits are validated. Invalid rate overrides fall back to bounded defaults. Production JWT secrets must be distinct, strong random values of at least 32 characters; refresh duration must exceed access duration.

### Bootstrap-only variables

`INITIAL_ADMIN_FIRST_NAME`, `INITIAL_ADMIN_LAST_NAME`, `INITIAL_ADMIN_EMAIL`, and secret `INITIAL_ADMIN_PASSWORD` are consumed only by the initial Admin seed, not normal runtime. Remove temporary bootstrap settings after successful first login and forced password change.

### Frontend public variable

`VITE_API_BASE_URL` is the only application-specific frontend env variable. Vite's built-in PROD selects production transport. Socket origin derives from the API origin; there is no VITE_SOCKET_URL. Never put DB/JWT/SMTP/Cloudinary secrets or bootstrap credentials in VITE variables or client build configuration.

No DATABASE_URL, MYSQL_URL, FRONTEND_URL, custom cookie-domain setting or invented email alias replaces the names above. CLOUDINARY_URL is unnecessary: the app explicitly requires its three Cloudinary variables even though the SDK recognizes the URL format.

## TiDB setup and migration execution

Use a dedicated production database/application user, least-privilege runtime grants and separate migration privileges where practical. Configure network access and backups before schema work. Keep local development credentials separate. Enable verified TLS with DB_SSL; certificate and hostname verification remain enabled, minimum TLS 1.2. Never disable verification to bypass connection errors. Budget pool size across all Vercel instances and operational clients.

The inspected service reported TiDB v8.5.3-serverless. Recheck current version, utf8mb4 collation, strict SQL mode, foreign-key enforcement, UTC/timezone behavior and provider quotas before future changes. Preserve existing uniqueness/collation semantics.

There is no migration framework. For a **fresh empty database only**, connect with a trusted SQL client using certificate/hostname verification and an interactive password prompt or protected options file. Confirm DATABASE() is supportflow_prod, then apply files from `server/database/migrations/` individually in this order:

1. `001_create_users_table.sql`
2. `002_create_refresh_tokens_table.sql`
3. `003_create_ticket_categories_table.sql`
4. `004_create_ticket_priorities_table.sql`
5. `005_create_tickets_table.sql`
6. `006_allow_ticket_number_generation.sql`
7. `007_create_ticket_assignments_table.sql`
8. `008_create_ticket_status_history_table.sql`
9. `009_create_ticket_comments_table.sql`
10. `010_create_ticket_attachments_table.sql`
11. `011_create_notifications_table.sql`
12. `012_create_sla_policies_table.sql`
13. `013_add_sla_deadlines_to_tickets.sql`
14. `014_add_notification_dedupe_key.sql`
15. `015_create_knowledge_base_categories_table.sql`
16. `016_create_knowledge_base_articles_table.sql`
17. `017_create_article_feedback_table.sql`
18. `018_create_ticket_feedback_table.sql`
19. `019_add_dashboard_ticket_scope_indexes.sql`
20. `020_create_audit_logs_table.sql`
21. `021_add_attachment_delivery_type.sql`
22. `022_create_password_reset_tokens_table.sql`

Stop on errors and record applied files/checksums in the release record. Do not replay the chain on an initialized database. CREATE IF NOT EXISTS does not reconcile drift; 013, 014 and 021 contain unguarded additions. DDL is not one rollbackable transaction.

### TiDB compatibility fixes

- **TLS:** the public endpoint rejected plaintext connections; DB_SSL must be true. Missing configuration defaults to local-compatible plaintext.
- **CHECK constraints:** the inspected cluster had tidb_enable_check_constraint OFF. Before migration 018, a privileged operator must run `SET GLOBAL tidb_enable_check_constraint = ON;` and verify it. If Cloud permissions prevent this, resolve through provider controls; do not silently omit rating enforcement. Keep foreign keys enabled.
- **Migration 014:** one ALTER adding dedupe_key and its index failed against the pre-ALTER schema. The checked-in file uses two sequential ALTER statements. Inspect partial state before retrying.
- **Migration 019:** execute its variables/PREPARE/EXECUTE steps in one SQL connection.
- **User pagination:** binary-prepared mysql2 execute with LIMIT/OFFSET parameters produced ER_WRONG_ARGUMENTS: Incorrect arguments to LIMIT. User listing now uses only validated bounded safe-integer pagination literals; search/filter values stay parameterized and sorting allowlisted. Never interpolate raw input. Other paginated repositories using text-protocol query were left unchanged.

Expect 17 tables: users, refresh_tokens, password_reset_tokens, ticket_categories, ticket_priorities, sla_policies, tickets, ticket_assignments, ticket_status_history, ticket_comments, ticket_attachments, notifications, knowledge_base_categories, knowledge_base_articles, article_feedback, ticket_feedback, audit_logs. Inspect columns, foreign keys, rating CHECK, notification dedupe uniqueness and dashboard indexes?not count alone.

## Seeds and initial Admin

After migrations, run from `server/`, with the intended production DB variables scoped securely:

```bash
npm run seed:categories
# Check success before continuing.
npm run seed:priorities
# Check success before continuing.
npm run seed:sla
```

Baseline: 10 active categories, four priorities LOW/MEDIUM/HIGH/CRITICAL with sort order 1?4, and four active SLA policies. Response/resolution minutes: LOW 480/2880, MEDIUM 240/1440, HIGH 60/480, CRITICAL 30/240. Seeds preserve matching records; inspect conflicts instead of blindly retrying. Category/priority seeds can partially complete. Category creators are NULL; Admin is not a prerequisite. Never run audit demo seed 005, write-capable test fixtures, or demo imports against production.

Admin bootstrap is a separate controlled step:

1. Temporarily supply the four INITIAL_ADMIN variables securely. Use a unique strong temporary password meeting normal auth policy; the seed checks presence but not full policy.
2. Confirm production target and email ownership, then run `npm run seed:admin` once from server/.
3. An absent email creates one active ADMIN, bcrypt-hashed through the shared cost-12 helper, with must_change_password=true. Existing email skips without overwriting password/role. This is per-email idempotence, not a global one-Admin restriction.
4. Log in over HTTPS, complete forced password change, sign in again and verify Admin access. Remove bootstrap variables, especially the temporary password, afterward.

## Cloudinary configuration

Configure the three server variables for the production environment. Uploads use server-authenticated streams, no unsigned browser preset and no permanent local filesystem. Multer accepts one memory-buffered file per request with a 10 MiB application cap. Extension/MIME allowlists and raster/PDF signatures are checked before upload. Allowed extensions: jpg/jpeg/png/webp/pdf/txt/csv/doc/docx/xls/xlsx. This is shallow validation, not malware scanning.

Assets use fixed supportflow/tickets structure, UUID identities, no overwrite, authenticated delivery and image/raw resource types. DB metadata includes public ID, HTTPS URL, resource/delivery types, MIME/size, original name and user/ticket/comment references. Downloads authorize first and proxy short-lived signed HTTPS fetches. DB-insert failure attempts remote cleanup with matching IDs/types. Compensation is not atomic: outages can leave orphan assets or stale metadata requiring reconciliation.

Verify real upload/download/delete permissions, quotas and Vercel payload limits. The 10 MiB application cap does not guarantee the hosting plan accepts that size. Profile image URLs are stored fields, not a separate upload pipeline; that validator permits HTTP as well as HTTPS.

## Brevo SMTP and recovery

Set SMTP_HOST to Brevo's relay hostname, SMTP_USER to its SMTP login, SMTP_PASS to an SMTP key (not API key/account password), and EMAIL_FROM_ADDRESS to a verified sender. Match port and secure flag: 587/false uses STARTTLS negotiation; 465/true uses implicit TLS. The current transport does not explicitly require STARTTLS on 587. EMAIL_FROM_NAME defaults to SupportFlow. Verify provider transport, sender/domain authentication, quotas and actual delivery.

Forgot-password and Admin reset await token creation, sendMail and failure cleanup before responding. Public recovery always returns a generic response; HTTP 200 is not delivery confirmation. A failed send invalidates that attempt's token where practical. SMTP and DB are not atomic, and account lookup/SMTP timing differs. No durable queue or automatic retry exists. Resolved sendMail results containing rejected recipients are not separately treated as failures.

Reset links derive from CLIENT_URL and resolve to the HTTPS frontend /reset-password route. Never include a real query token in logs/docs. HTML templates escape user content; safe diagnostic logs retain allowlisted stage/error codes instead of raw provider replies or credentials. Temporary verify-smtp scripts were removed. Assignment/status/comment email templates exist but are **not wired to automatic SMTP delivery**: ticket notifications use MySQL and Socket.IO.

## Realtime, CORS and authentication

The shared authenticated frontend provider mounts above role routes for ADMIN, TECHNICIAN and EMPLOYEE. It connects with an access token and no pending forced change. Route changes retain the socket; token changes replace authentication; logout cleans up. Production uses websocket-only transport. Server verifies the token/current user, joins only user:{verified-id}, and emits notification:new after DB commit. Client-selected rooms are unsupported.

On multi-instance Vercel, rooms/emissions remain process-local: **realtime delivery is best effort**. Persisted notifications are authoritative; reconnect/window focus triggers REST recovery even outside the inbox. A connected foreground view can remain stale until reconciliation. Function duration/redeployments can close sockets; token-expiry disconnects require token renewal/resubscription. No Redis/adapter or persistent SLA scheduler was introduced. SLA helpers do not establish scheduled warning/breach automation.

REST/Socket.IO share exact CLIENT_URL with credentials enabled, never wildcard credentialed CORS. REST methods: GET/POST/PUT/PATCH/DELETE/OPTIONS; request headers Content-Type/Authorization; exposed Content-Disposition. Allowed preflights return 204. Socket upgrades also validate origin. Development falls back to localhost:5173 only outside production if CLIENT_URL is absent. Explicit HTTP/localhost config still passes validation, so verify actual production settings.

Separate *.vercel.app deployments are separate sites. Refresh cookies are HttpOnly, Secure and SameSite=None in production, **host-only**, path /api/v1/auth, expiry tied to refresh credential. Never set Domain=.vercel.app. Development stays Lax. Axios preserves withCredentials; access tokens remain in memory. Third-party-cookie restrictions can still apply. Exact CORS alone is not CSRF protection. Custom domains normally need env changes/rebuilds and cookie-topology review rather than hardcoded URLs.

## HTTPS and security

Vercel redirects public HTTP to HTTPS; Socket.IO uses WSS. Backend Helmet sets HSTS, restrictive API CSP, nosniff, frame denial, no-referrer and Permissions-Policy. Proxy trust is one hop only under VERCEL=1 plus production, based on overwritten forwarded headers; do not copy this assumption to arbitrary hosts. Frontend document CSP/frame/referrer/policy headers remain a hardening gap; API Helmet does not protect the static frontend document.

JWT secrets remain server-only; production rejects weak/equal signing keys. Access/refresh durations must be positive with refresh longer than access; refresh records store hashes. Unexpected API failures do not return stacks. Rate limiters are in-memory and process-local, reset on restart, and are **not globally shared across Vercel instances**.

## Verification status and release checklist

The status below is supplied by the project owner for Phase 20.16. Earlier local tests/public probes corroborated individual components; this documentation update does not rerun authenticated production workflows or create a deployment.

| Deployment check | Recorded status |
| --- | --- |
| Backend health | Passed |
| TiDB connection | Passed |
| Frontend production API configuration | Passed |
| Cross-site refresh/session restoration | Passed |
| Cloudinary production configuration | Passed |
| Brevo SMTP after production environment correction | Passed |
| Socket.IO WebSocket handshake | Passed |
| CORS | Passed |
| HTTPS/security verification | Passed, with documented hardening gaps |
| Admin/user management production DB retrieval | Passed after pagination fix |
| Production smoke/full workflow testing | Completed, as reported by project owner |

Repeat after material changes: health/deep links; login/refresh/F5/logout/expiry; forced change/recovery/Admin reset; user listing pagination/filters; Employee ticket creation; Admin assignment; Technician updates/comments; attachment access/deletion; notification disconnect/reconnect/refocus recovery; resolution/feedback; SLA display; knowledge base; analytics/reports/exports; audit access. A handshake alone does not prove every authenticated event-delivery scenario.

Use isolated accounts/mocked providers for local regressions, not production write fixtures. The server has no general test/lint script; run relevant existing node --test files. Record release revision and sanitized results, never credentials, tokens, cookies or personal records.

## Troubleshooting discovered during deployment

| Symptom | Cause/action |
| --- | --- |
| Backend platform 404 for root and health | Preserve explicit server/vercel.json Node build/catch-all routing; inspect function output and redeploy. |
| Frontend direct-route 404 | Preserve client SPA fallback and correct Vite project/output settings. |
| Login startup session banner | Old bundle embedded localhost API URL; set production public env before rebuilding. Expected missing-cookie 401 is already silent. |
| Refresh lost on F5 | Check SameSite=None/Secure/host-only scope, exact credentialed CORS, withCredentials and browser cookie restrictions. |
| TiDB rejects insecure transport | Enable verified DB_SSL; never disable verification or pass raw ssl:true. |
| Missing rating CHECK enforcement | Enable/verify TiDB CHECK support before migration 018; inspect resulting constraint. |
| Migration 014 missing dedupe column | Use split ALTER statements; inspect partial application before retrying. |
| Users 500 / Incorrect arguments to LIMIT | Deploy validated numeric user-pagination fix, preserving bound filters and response contract. |
| No socket outside NotificationsPage | Deploy shared authenticated provider; old page-owned lifecycle only connected on the inbox. |
| Connected socket misses event | Check recipient/token/room/DB commit, then REST refetch; cross-instance emission is best effort. |
| Forgot-password 200 but no email | Check active user, reset-token table, safe stage/code logs, production SMTP login/key/host, sender verification and quota. |
| EAUTH / SMTP 535 | Correct deployed Brevo SMTP login/key, not only local .env. Never log full transporter config. |

## Backup and rollback

Keep previous compatible frontend/backend deployments and preserve production env securely outside Git. Back up before destructive schema work using provider facilities or an encrypted logical dump with protected client settings and verified TLS; rehearse restoration into a separate database. Record migration state and prefer additive changes. Never replay migrations, DROP/TRUNCATE, or restore over new live writes as a troubleshooting shortcut. Coordinate Cloudinary asset retention with DB recovery. Roll back code only when schema/configuration remain compatible; rotate compromised credentials instead of restoring them.

# SupportFlow security — Phase 18 final review

Reviewed 2026-10-14 against `056ec62`, with the documentation changes in Phase 18.20. **Phase 18 is approved for completion within the local portfolio scope.** No unresolved Critical/High defect was confirmed in the reviewed application paths. This is not production certification; the deployment requirements and limitations below remain mandatory review items. Phase 19 was not started.

## Final checklist

PASS means the implemented control and available local evidence were reviewed; it does not certify every deployment or provider configuration.

| Control | Final result |
| --- | --- |
| Validation | PASS; bounded IDs, query filters, enums and body allowlists. Existing field validation uses 422, not uniformly 400. |
| SQL injection | PASS; bound values, allowlisted update/sort identifiers, validated pagination; audit search is literal. |
| XSS | PASS; React plain text for tickets, KB, filenames and audit data; escaped email HTML; no application `dangerouslySetInnerHTML` or eval found. |
| Headers | PASS; centralized Helmet, no X-Powered-By, nosniff, DENY framing, no-referrer, production-only HSTS, private/no-store sensitive responses. |
| Rate limiting | PASS; general and stricter login limits, safe 429, standard draft-8/Retry-After headers, general OPTIONS skip; per-process memory store. |
| Cookies | PASS; HttpOnly refresh cookie, production Secure, SameSite=Lax, `/api/v1/auth` Path, no Domain, aligned expiry and clearing. |
| CORS | PASS; exact CLIENT_URL, credentials, Authorization/Content-Type allowed, Content-Disposition exposed, aligned Socket.IO handshake policy. |
| JWT/session | PASS; HS256, typed credentials, expiry, hashed refresh storage, atomic rotation/revocation, current account/role checks. |
| Upload | PASS with documented content-scanning limitation; single 10 MiB attachment and restricted formats. |
| Cloudinary | PASS for new authenticated uploads and application download authorization; legacy public assets remain a limitation. |
| RBAC/IDOR | PASS; ownership, assignment, nested resources, unpublished KB, Admin-only operations and recipient socket rooms. |
| Secrets | PASS within local inspection scope; env ignored, examples tracked, backend-only secrets, safe startup validation/logging and browser build. |
| Audit writes | PASS; centralized bounded/redacted writer, actor/entity indexes, deliberate transactional/best-effort policies, no accidental duplicate events. |
| Audit retrieval | PASS; Admin-only GET, validated filters, fixed ordering, bounded pagination, safe legacy metadata, no write endpoints. |
| Dependency audit | PASS; both npm audits reported zero vulnerabilities across all severities. |
| Regression | PASS; current verification below plus the wider Phase 18.19 evidence. |

## Authentication and authorization

Passwords use bcrypt. Access JWTs are kept in browser memory; only theme preference uses localStorage. Refresh JWTs use an HttpOnly cookie. The database stores SHA-256 token hashes, expiry and revocation state, never raw refresh credentials. Rotation conditionally consumes the old session and inserts its replacement in one transaction; concurrent use cannot mint two valid replacements. Logout revokes the presented session; logout-all and password changes revoke the user's refresh sessions. Client refresh is deduplicated and retries once without login/refresh recursion.

Verification explicitly permits HS256 and checks expiry, subject and token type. Newly issued access tokens are typed; the compatibility verifier accepts old untyped access tokens until their expiry, but rejects explicitly different types. Each protected request checks the current database account, activity and role; mandatory password changes restrict access. Login/refresh failures avoid account enumeration.

Employees access their own tickets. Technicians use assignment/status rules; Admin mutations, reports, analytics and audits require Admin authorization. Notification ownership has no Admin bypass. Attachments and comments validate parent relationships and visibility. Unpublished KB content is hidden from ordinary readers. Socket rooms derive from authenticated identity, not client-selected recipients.

## Request, response and storage boundaries

Validated request values use SQL parameters. Dynamic identifiers come from fixed maps; repositories guard pagination and update fields. User text stays plain text rather than being pre-encoded. Email templates escape interpolated user text. Safe API errors omit stack traces, SQL, credentials and provider internals. Contracts include malformed/audit-query 400, unauthenticated 401, forbidden 403, hidden/not-found 404, conflict 409, oversize 413, unsupported upload 415, field validation 422, rate limit 429, provider 502 and unexpected fault 500. These established contracts were preserved.

The JSON API uses a restrictive CSP. COEP is intentionally omitted because this API does not serve the React document; frontend document headers must be configured at its host. HSTS is production-only (one year, no subdomain/preload commitment). Default limits are 1,000 general requests per 15 minutes (5,000 in development) and five failed login attempts per 15 minutes; successful logins are skipped. Review configured overrides before deployment. `trust proxy` remains false.

Uploads accept one `attachment` file, no text fields, at most 10 MiB: PDF, PNG, JPG/JPEG, WebP, TXT, CSV, DOC/DOCX and XLS/XLSX. Executables, scripts, HTML, SVG, standalone archives and macro-specific extensions are rejected. Filenames are normalized to basenames and checked for controls/length; download headers are sanitized. Authorization precedes buffering and is rechecked before storage. Raster/PDF signatures are shallow checks; Office/text validation uses extension/MIME metadata.

New Cloudinary assets use server-generated UUID identities under `supportflow/tickets`, restricted image/raw resource types and formats, authenticated delivery, HTTPS and backend-only credentials. Authorized downloads proxy bounded bytes from short-lived signed server-side URLs, without exposing provider URLs or redirecting the browser. Deletion uses trusted persisted identity. DB insertion failures trigger best-effort provider compensation; failure categories are logged safely.

## Audit design and actual events

Migration 020 supplies timestamped actor/entity-aware audit rows and created-time, actor, action and entity indexes. Application writes are append-only; there is no edit/delete API or database immutability trigger. Actor deletion sets its FK to NULL while preserving the event. The centralized writer validates identifiers/actions/entities, recursively redacts secret keys and rejects unsafe objects; metadata is limited to 16 KiB, depth eight and 1,024 nodes. Callers construct minimal safe context rather than dumping requests. Redaction cannot identify an arbitrary secret hidden under an innocuous key.

Actual Admin events: USER_CREATED, USER_ROLE_CHANGED, USER_ACTIVATED/DEACTIVATED; CATEGORY_CREATED/UPDATED/ACTIVATED/DEACTIVATED; TICKET_ASSIGNED/REASSIGNED/UNASSIGNED/PRIORITY_CHANGED; SLA_POLICY_UPDATED; KB_CATEGORY_CREATED/UPDATED/ACTIVATED/DEACTIVATED; KB_ARTICLE_CREATED/UPDATED/PUBLISHED/UNPUBLISHED/ARCHIVED. Ticket priority auditing is Admin-only. Constants for other events do not imply instrumentation.

Security events: LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, LOGOUT_ALL, PASSWORD_CHANGED and selected REFRESH_TOKEN_REJECTED cases (verified unexpired revoked/racing sessions or inactive-account session use). Routine refreshes, invalid/expired random tokens, GETs, page views, notification reads and access verification are not logged. Failures and no-ops do not create misleading success events. No overlapping controller/service duplicate was found.

Ticket mutations include strict audit inserts before committing their transaction: failure rolls back both. Nontransactional user/category/SLA/KB actions and security events use best-effort logging after successful business work; audit failure does not undo that work. Helpers explicitly use strict mode when a caller supplies a transaction connection. This is a deliberate policy, not a universal guarantee of audit durability.

GET `/api/v1/audit-logs` is Admin-only, private/no-store, defaults to page 1/limit 25 and caps limit at 100. It validates known action/entity filters, positive identifiers, bounded literal search and UTC date ranges; ordering is fixed to created_at/id descending. Unsupported sort/order/outcome inputs return 400. Empty results return 200. Retrieval caps and allowlists legacy metadata before returning it; the viewer renders it as text.

## Verification and dependency review

Phase 18.20 reran:

- Backend `node --test tests/*.test.js`: **379 passed, one opt-in skipped, zero failed** (380 total). `npm run test:sla`: **89 passed** (overlapping coverage). Backend startup and live MySQL health: UP/UP. No backend lint or generic npm test script exists.
- Client `npm run build` and `npm run lint`: passed. Build retains the existing large-chunk warning. All **59 existing smoke scripts passed**; no frontend npm test script exists.
- Three isolated browser suites passed: auth-cookie (login/refresh/logout/multipart/download), audit retrieval, and polish on login, Employee create/detail, Technician detail and Admin audit routes at the existing viewport/theme variants. No new console warnings/unhandled exceptions were reported by these checks. Browser fixture data is mocked.
- `npm audit --json` in server and client succeeded: **0 low/moderate/high/critical vulnerabilities**, including development dependencies. No advisory required reachability/remediation classification; no packages or lockfiles changed. A zero audit count only reflects the registry's known advisory coverage at review time.

[Phase 18.19 regression results](../server/SECURITY_REGRESSION_RESULTS.md) retain the broader evidence: the opt-in read-only reports test passed separately, nine MySQL smokes, 78 real HTTP/MySQL workflow checks including real recipient-isolated sockets, seven browser suites and harmless live PNG/TXT Cloudinary uploads with successful cleanup. Those live mutations/provider checks were not repeated during this documentation-only sign-off. Actual SMTP delivery and deployed HTTPS behavior were **not tested**.

## Remaining limitations and severity

| Severity | Finding / boundary | Required follow-up |
| --- | --- | --- |
| Medium, conditional | Legacy pre-18.11 assets retain public Cloudinary `upload` delivery. The local DB inventory contains seven such references; actual remote existence/content/unsigned retrieval was not tested in 18.20. Signing application downloads does not revoke old URLs. | Inventory sensitive content and migrate protected replacements, then invalidate old public assets before production confidentiality claims. This is accepted only for the local portfolio scope, not approval to publish sensitive files. See [migration procedure](../server/CLOUDINARY_RESTRICTIONS.md). |
| Medium, content-dependent | No antivirus/full Office parser; legacy DOC/XLS may contain macros, and permitted PDF/Office files can be malicious. Shallow signatures do not prove safety. | Use trusted harmless portfolio files; assess scanning/quarantine before accepting untrusted production documents. |
| Low, scale-dependent | Rate limits are per-process, reset on restart and have no distributed store; concurrent memory uploads consume capacity. | Reassess shared limits, ingress limits and capacity at deployment/scale. |
| Informational | Stateless access JWTs remain valid until configured short expiry after logout/password change. Current database role/activity checks still apply. Startup validates positive lifetimes and refresh > access, but does not enforce an absolute short access TTL. | Configure and verify a short access lifetime; no blacklist was added. |
| Low, reliability | Provider compensation can fail; best-effort audit writes can lose events after successful business actions. | Monitor category-only failures; plan orphan reconciliation and audit durability/retention requirements. |
| Informational | Audit is not tamper-proof against DB administrators and has no enterprise SIEM integration. Five earlier test login events were deliberately retained as documented in 18.19. | Apply least privilege and retention/access policy; do not infer historical event deletion. |
| Informational | Local tests do not certify provider settings, email delivery or a deployed browser/TLS/proxy topology. | Complete staging acceptance in Phase 20. |

No confirmed unresolved Critical/High finding was identified. Legacy public storage would require reassessment if real confidential content is exposed; the inventory count alone does not establish such exposure.

## Requirements for Phase 20

Use HTTPS for frontend/API, production NODE_ENV, an explicit trusted HTTPS CLIENT_URL and correct public API URL. Secure cookies/HSTS do not provision TLS. Choose an intended same-site architecture for the SameSite=Lax refresh cookie; cross-site refresh may fail. CORS limits browser response access, not all request submission. HttpOnly prevents JavaScript cookie reads, not CSRF. If SameSite=None is later required, add and verify a dedicated CSRF defense and reassess cookie/browser policies before changing it.

Supply independent strong random JWT secrets (at least 32 characters), short access/longer refresh lifetimes, least-privileged DB credentials and Cloudinary credentials through backend secret storage. Configure the complete SMTP group if email is enabled; otherwise it remains explicitly optional. Apply all migrations including 020/021; protect DB/network/backups and restrict audit access. Configure frontend document headers separately.

Match `trust proxy` to the actual trusted proxy topology and test derived client IPs/limits; never blindly set it to true. Review limiter overrides and Cloudinary authenticated image/raw support, presets, format policy and legacy assets in staging. Test harmless uploads/downloads and email delivery there. No deployment, credential rotation or Git-history rewriting was performed.

Only `.env.example` files are tracked. `VITE_API_BASE_URL` is public configuration; backend secrets must never enter VITE variables. Current-source/log inspection found no operational secret or temporary bypass. Phase 18.13's local reachable-history scan found no configured-secret/high-confidence credential matches; this is not proof about remote/unreachable history. Removing a current secret never cleans history: revoke/rotate any subsequently discovered leaked credential.

## Phase 18.20 changes and Git hygiene

Changed files: this document and a README link. No application, schema, dependency or test infrastructure changes; no final application defect required correction. Specifically identified Phase 18.19/18.20 regression/audit outputs and the isolated Phase 18.20 browser profile were removed; intentional test scripts and review reports were retained. Automatic approval review rejected broader cleanup of older ignored logs because their provenance was unverified; those files were preserved and are not pending commit. Final diff/status checks cover only the two documentation files, with no secrets, fixture uploads or giant binaries pending commit. No commit was created.

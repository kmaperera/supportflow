# Phase 18.19 — Security regression results

Run date: 2026-10-14 (Asia/Colombo). Starting repository: clean `main`, commit `6f79c2d` (`harden audit log retrieval`). No user work was reset or discarded. This is regression testing of Phases 18.1–18.18, not the Phase 18.20 final review or Phase 19 work.

## Infrastructure and executed suites

Reused Node's built-in backend tests, existing Vite/React SSR smoke scripts, existing Chrome DevTools browser fixtures, local MySQL smoke scripts and Socket.IO test clients. No Supertest/Vitest/Jest or other testing framework/dependency was added. The committed Postman collection remains available, but executable tests were used instead of manually running that collection.

- Full backend: `node --test tests/*.test.js` — **379 passed, one opt-in test skipped, zero failed** (380 tests).
- The skipped read-only MySQL reports test was then enabled with `RUN_REPORT_DB_TESTS=1` and passed separately. Thus every backend test was exercised successfully.
- Existing `npm run test:sla` — **89 passed**, zero failures (overlapping focused coverage, not 89 additional unique backend tests).
- All **59 client `*.smoke.mjs` scripts** ran. Initially 57 passed and two stale assertions failed; after the assertion corrections below, both repaired scripts passed. No other client smoke failed.
- Nine existing local MySQL smokes passed: SQL injection/driver escaping, refresh rotation, permissions/IDOR, BIGINT identity, audit schema, audit writing, admin auditing, security auditing and retrieval.
- New `node tests/security.workflows.mysql.smoke.js` passed **78 real HTTP/MySQL checks** with Employee A/B, Technician A/B and Admin, plus real Socket.IO clients. The external upload/download byte provider is stubbed in this workflow check; authentication, authorization, validation, SQL, persistence, audit calls and notification delivery are real.
- Seven browser suites passed: server auth-cookie CDP; client XSS, all-route polish, audit retrieval controls, mobile navigation, keyboard and accessibility CDP scripts. Browser fixtures use safe fake data; they are not a deployed production-browser test.

## Security-area results

| Area | Evidence and result |
| --- | --- |
| Input validation | Backend input/route tests cover invalid IDs, precision/range, pagination, enums, extra fields, duplicate inputs, malformed JSON and parser limits; cross-role workflow rejects mass-assignment input. No SQL/stack leakage or protected-state changes. |
| SQL injection | Bound repository/filter tests plus live mysql2 query/execute payload probes and disabled multi-statements passed. Audit SQL-looking search remained literal and returned no widened results. Sort/filter injection is rejected. |
| XSS | Browser XSS suite covered ticket/comment/internal-note/KB text, filenames, notifications, dialogs/toasts, actor/audit data, reports/charts and URL props; no payload execution. Text remains plain React data. |
| Headers | Unit/HTTP coverage verifies nosniff, frame/CSP protection, Referrer-Policy, absent X-Powered-By and environment-aware HSTS. Live workflow responses retained nosniff and safe file download headers. Auth/audit responses retain private/no-store. |
| General rate limit | Reduced-limit HTTP tests verify 429 envelope and OPTIONS skipping. Normal 78-request role workflows did not unexpectedly reach 429. |
| Login rate limit | Controlled failed attempts hit the configured threshold; successful-request skipping and generic wrong/unknown/inactive credential responses passed. No brute-force traffic or existing-user lockout testing was performed. |
| Cookies | Browser and actual-cookie tests verify HttpOnly, SameSite Lax, auth-scoped path, expiry/refresh alignment, production Secure attributes, JavaScript invisibility and matched clearing attributes. Logout/logout-all revocation passed. |
| CORS | Live startup/preflight check passed for the trusted frontend origin and credentials/Authorization/Content-Type/PATCH/POST; evil.example received no allow-origin grant. Export Content-Disposition remains exposed. Socket origin/handshake tests passed. |
| JWT/sessions | Valid/tampered/expired/type-misused/revoked credentials, atomic rotation, logout-all, inactivity, mandatory password changes and current DB roles passed. Client refresh tests verify one refresh/retry, no recursion, login-401 exclusion and memory-only tokens. |
| Uploads | Actual multipart tests cover allowed PDF/raster/text workflows, all supported Office/text MIME mappings, rejected extensions/double extensions, size/signature/MIME mismatch, wrong fields, excess files/text parts and malformed multipart. Bad uploads never reach storage or create DB rows. |
| Cloudinary | Fixed folder/generated identity/resource type/private authenticated delivery, stripped provider fields, authorization before provider access, signed server-side download and DB-failure compensation tests passed. Live harmless PNG and text uploads both passed; both generated assets were deleted successfully. No private URLs/secrets were printed. |
| IDOR/permissions | Employee A/B and Technician A/B/Admin matrices and live checks cover ticket access/mutation, internal notes, notifications without Admin bypass, attachments/no redirects or leaked URLs, nested resource swaps, unpublished KB and Admin-only user/category/SLA/report/audit operations. BIGINT identities remain distinct. |
| Environment secrets | No actual env file is Git-tracked; root/nested ignore checks passed. Built frontend search found no backend secret names or nontrivial configured secret-value matches; VITE_API_BASE_URL remains the only custom frontend env value. Real startup with blank access secret, refresh secret or DB password failed safely naming the variable, without values/stacks. Logger/SDK-error tests exclude credentials, query tokens, bodies and headers. |
| Audit writing | Unit and live tests verify exact actors/targets, concise secret-free metadata, no duplicate events, no-op/conflict behavior, transaction rollback and best-effort failure policy. Admin and security smokes passed against the final retrieval contract. |
| Audit retrieval | Admin 200, Employee/Technician 403, anonymous 401, invalid query 400; constant filters, UTC dates, literal search, tied-timestamp pagination, no-store, NULL actors, legacy secret/oversized metadata and no self-auditing passed. Outcome/sort/order are unsupported, correctly rejected rather than invented. |
| Error handling | Representative malformed 400, authentication 401, authorization 403, hidden-resource 404, workflow/stale 409, limiter 429 and unexpected 500 envelopes passed without raw SQL, SDK/JWT stacks or filesystem paths in client responses. |

### Status-code contract note

The checklist uses 400 for many validation examples. Existing SupportFlow general field/route validation intentionally returns **422**; malformed JSON/multipart and audit-query validation return **400**. Regression checks verified these established contracts, bounded behavior and safe error bodies. No blanket status conversion or frontend error-contract break was introduced. Inactive login/refresh retain Phase 18.17's generic 401; inactive protected-resource requests retain their documented 403 policy.

## Normal workflows and realtime

The new isolated live workflow verifies:

- Employee: actual login, dashboard/profile (`auth/me`), ticket creation with SLA deadlines, my tickets/detail/edit, public comment, attachment upload/list/authorized download, notification reads, published KB, reopening from RESOLVED, closure/rating and logout. Reopening a CLOSED ticket correctly returns the established 409.
- Technician: actual login/dashboard/profile, unassigned queue, self-assignment/assigned listing/detail, working-status and priority changes, public/internal visibility, resolution, SLA state, notifications and logout. Another technician cannot mutate that assigned ticket.
- Admin: actual login/dashboard/profile, users/technician lists and workloads, category creation, queue/assign/reassign/unassign with stale 409, KB create/publish/archive, analytics/report reads, CSV/PDF downloads with disposition/CORS exposure, notifications, audit retrieval and logout. Separate admin-audit live tests cover user creation/role/status, category status, SLA modification and KB edit/unpublish events.
- Real trusted-origin Socket.IO delivered the new ticket notification only to its recipient. Stored ownership and user:{id} rooms were checked with a barrier to rule out delayed delivery to Employee B. Existing real-socket adversarial tests and frontend realtime/unread-state smokes also passed.

The all-route browser polish run covered the existing 33 auth/Employee/Technician/Admin routes at six widths in light/dark themes. Cookie/XSS/keyboard/accessibility and audit-filter/pagination/empty/error/Clear Filters checks passed without new important console warnings, uncaught errors or layout overflow. Browser data-provider errors intentionally used for error-state tests are not normal-workflow network failures.

## Findings and fixes

**No application/security bug was confirmed requiring production-source changes.** Three test issues were corrected:

1. `client/tests/createTicket.smoke.mjs` expected obsolete unavailable-option wording and an enabled submit button during SSR. SSR does not run lookup effects; the current safe initial state is loading with submission disabled. The test now asserts that guard while retaining payload, validation, safe errors and success-feedback checks.
2. `client/tests/technicianResolve.smoke.mjs` searched for the old contiguous `Resolution note *` HTML. The accessible label now separates its decorative star into a span. The test verifies label association/text and retains eligibility, pending/empty summary, length and API payload checks.
3. `server/tests/permissions.mysql.smoke.js` deleted fixture users/sessions but Phase 18.17 login instrumentation left audit records behind. It now runs on a caller-owned outer transaction with service savepoints and rolls back fixture data, sessions and audit events together. Rerunning its 40 permission checks passed and left the prior audit-row count unchanged.

The initial run of the old permission smoke left **five test LOGIN_SUCCESS audit rows**, whose fixture users were then deleted (actor FK becomes NULL). These earlier records were deliberately left intact instead of inferring history deletions; the local audit table now contains eight rows rather than the prior three demo rows. The repaired test creates no further retained rows. New workflow/audit smokes rolled back all their own data, and live provider assets were explicitly cleaned up. Rolled-back AUTO_INCREMENT allocations can leave ID gaps.

## Limits and reproducibility

- Tests exercised a local development database and isolated browser fixtures, not a deployed HTTPS environment. Production header/cookie behavior is covered by environment-specific tests; provider/network/deployment combinations are not exhaustively certified.
- Cloudinary live verification covered PNG (image) and text (raw). PDF/JPEG/WebP, Office mappings and compensation/private download behavior have mocked provider-boundary coverage; full vendor round trips for every supported extension were not performed.
- Office/text handling retains the existing extension/MIME policy; it is not a complete Office parser or malware scanner. No new scanning service was introduced.
- Browser workflow data is mocked; normal business mutations were independently verified against HTTP/MySQL. No end-to-end browser session using the deployment's actual user database was exercised.
- No email delivery, deployment/CI changes, history rewriting, credential rotation or app refactor was undertaken.

Backend startup and live DB health passed (server UP/database UP). `server/package.json` has no generic npm test or lint command; the full Node suite and existing test:sla script were run directly. Client `npm run build` and `npm run lint` passed; there is no npm frontend test script, so the 59 existing smoke scripts were executed directly. Build retains the existing large-chunk warning.

To rerun the new isolated normal-workflow check from `server/`:

```sh
node tests/security.workflows.mysql.smoke.js
```

It requires local non-production env/database configuration and never performs a live provider upload. Its uploaded/downloaded fixture bytes are deliberately stubbed.

Final changed files: the two client smoke tests, the permission smoke isolation fix, new `tests/security.workflows.mysql.smoke.js`, and this report. Initial state was clean; final state contains only these Phase 18.19 test/documentation changes. `git diff --check` passed. No commit was created, no application source/schema was changed, and Phase 18.20/Phase 19 was not started.

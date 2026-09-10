# Phase 12.16 export authorization review

Reviewed all 16 GET routes under /api/v1/reports:

- JSON: tickets, date-range, technician-performance, sla, categories, priorities,
  statuses.
- CSV: tickets/export/csv, date-range/export/csv,
  technician-performance/export/csv, sla/export/csv, categories/export/csv,
  priorities/export/csv, statuses/export/csv.
- PDF: tickets/export/pdf, analytics/export/pdf.

The reports router is mounted once in app.js. Every route follows router-level
`authenticate` then `authorizeRoles(USER_ROLES.ADMIN)`, followed by its validation
and controller. No route precedes the guard; there are no dynamic ticket routes
that swallow exports. No report-specific role checks or redundant guards added.
Authentication loads the current database user into req.user; client query values
and JWT role claims do not override the current account role. Missing/expired/bad
credentials and deleted accounts return 401; inactive accounts and non-ADMIN roles
return 403 under existing middleware conventions.

One shared verifier gap was fixed: verifyAccessToken now rejects the persisted
refresh-token marker (`type: refresh`) even if access/refresh signing secrets were
accidentally identical. Distinct secrets already rejected these by signature.
This uses the existing verifier and JSON authentication error handling; no separate
export auth mechanism or new JWT architecture was introduced.

The new authorization matrix exercises every route with missing/malformed/expired/
invalid-signature credentials, refresh credentials, employee/technician accounts,
inactive/deleted accounts, an unknown role, and a stale ADMIN claim on a current
employee. Spoofed query roles/IDs and invalid filters cannot bypass authorization.
Spies confirm no denied request reaches report services, report SQL or generators.
Valid ADMIN with unsupported path/filename parameters is rejected by validation.
Existing endpoint suites verify ADMIN success and CSV/PDF/JSON content types plus
normal JSON errors for validation/generation failures.

Download helpers are called only after report generation completes. Denials have
no attachment headers. The app exposes no static export directory or persisted
export URL. Filename bases are server-owned; utilities remain generic. Repository,
filter, sorting, date, pagination, layout, column and calculation contracts are
unchanged. No rate limiting, audit logging, or other Phase 18 features were added.

# Phase 18.13: Environment-secret protection

Scope: environment/configuration protection only. Existing audit modules were left untouched; no Phase 18.14–18.20 implementation was added.

## Environment inventory

| Classification | Variables | Requirement |
| --- | --- | --- |
| Secret | JWT_ACCESS_SECRET, JWT_REFRESH_SECRET | Required at startup; production requires distinct strong values of at least 32 characters |
| Secret | DB_PASSWORD | Required at startup; preserved without trimming |
| Secret | CLOUDINARY_API_SECRET | Required at startup; backend SDK only |
| Secret | SMTP_PASS | Required when email configured; preserved without trimming |
| Secret | INITIAL_ADMIN_PASSWORD | Required only for initial-admin seed; no default, password/hash never logged |
| Sensitive but not secret | DB_USER, DB_HOST, DB_NAME, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY | Backend only; required at startup. Cloudinary API key is an identifier, not the signing secret |
| Sensitive but not secret | SMTP_USER, EMAIL_FROM_ADDRESS, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_FIRST_NAME, INITIAL_ADMIN_LAST_NAME | Backend contact/account identity; mail fields required when enabled, admin fields seed-only |
| Public frontend config | VITE_API_BASE_URL | API URL; only custom browser env variable used |
| Non-sensitive config | NODE_ENV, PORT, DB_PORT, JWT_ACCESS_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, CLIENT_URL | Startup configuration; production CLIENT_URL required; numeric ports checked; existing JWT lifetime checks retained |
| Non-sensitive config | SMTP_HOST, SMTP_PORT, SMTP_SECURE, EMAIL_FROM_NAME | Optional email configuration; complete group validated when enabled |
| Non-sensitive config | API_RATE_LIMIT_WINDOW_MS, API_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS, LOGIN_RATE_LIMIT_MAX | Optional existing rate-limit overrides |
| Non-sensitive test/tool config | COOKIE_CDP_PORT, KEYBOARD_CDP_PORT, POLISH_ROUTES, RUN_REPORT_DB_TESTS, TEST_API_URL, TEST_CLIENT_ORIGIN | Test ports, route selection, opt-in DB tests and origins |

No separate session/cookie signing secret, private third-party frontend key or additional production credential variable was found. Refresh cookies remain HttpOnly; tokens remain in memory rather than localStorage/sessionStorage. Browser storage usage in application source is limited to theme preference.

## Changes and behavior

- `src/config/env.js` validates configuration before app, database pool and Cloudinary SDK loading. Errors identify variable names without values. Database credentials, JWT settings and Cloudinary settings are required; example placeholders are rejected. Ports and environment names are checked. Existing production JWT strength, distinct-key and lifetime rules are preserved.
- SMTP is optional when its required fields are all absent/blank. Partial configuration fails startup. Mailer and Cloudinary reuse central validators; direct JWT operations retain fail-closed checks for standalone use.
- `src/server.js` loads `server/.env` by absolute application-relative path, quietly, without overwriting deployment env values.
- Request logging now records method, path, status and duration, excluding URL query values, request bodies and headers. Existing provider/error handlers suppress raw credential-bearing SDK/database errors; no env/config object dumps or debug/config retrieval endpoints were found. Health remains server/database UP only.
- Backend example values are obvious placeholders. SMTP stays blank for optional onboarding. Client example explicitly warns that VITE values are public.
- Root ignore rules cover nested `.env` variants, with `.env.example` allowed. Added private-key, local npm credential, backup and dump exclusions. Legitimate public certificates would need an explicit exception if introduced later.
- README documents local setup, required/optional configuration, production secret storage and leak response.

## Repository and history findings

Reviewed 595 tracked files across source, configs, tests, seed/migration files, README and the committed Postman collection. Credential-related literal candidates reviewed were UI labels/validation text or fake isolated test credentials. Postman uses blank token variables and variable references. No hardcoded operational secret was identified. No tracked private keys, npm credential file, database dump, Docker/deploy/CI configuration or shell script was found. The sole tracked image is the frontend hero asset, not a setup screenshot.

`git ls-files` lists only `server/.env.example` and `client/.env.example` as env files. Local `server/.env` and `client/.env` are untracked and ignored. `git check-ignore -v` confirmed root and nested `.env`, `.env.local`, `.env.production`, and `.env.development.local` variants. No index removal was needed.

Scanned all 263 locally reachable commits for actual env-file paths, high-confidence GitHub token/private-key/credential-bearing connection-string patterns, and exact occurrences of locally configured secret values (only path/type results emitted). No matches were found. This is a local pattern scan, not proof that every historical credential or remote/unreachable commit is clean. No credential rotation is indicated by these findings. If a leak is discovered, revoke/regenerate Gmail app passwords, rotate Cloudinary/DB credentials and update backend env only; rotate JWT keys when affected, accepting token invalidation. History was not rewritten.

## Verification

- Backend Node suite: 354 passed, 1 skipped, 0 failed (355 tests). Includes focused env/missing-secret/placeholder/production-strength/mail/query-log tests and existing auth/session/Cloudinary/email regressions.
- Normal server startup and live health: passed, server UP / database UP. Live MySQL connection passed.
- Live SMTP connection verification: unavailable in this environment; no email was sent. Mocked email regressions passed. Actual delivery is not established.
- Cloudinary upload restrictions/provider-boundary regressions passed with mocked provider. No live provider upload or cleanup was performed; external upload success is not established.
- Auth login/refresh regressions passed against existing isolated test fixtures; no real user password or issued token was printed. No live user login was performed.
- Client `npm run build` and `npm run lint`: passed. Build emits an existing large-chunk warning. Generated assets contain zero backend secret-name or locally configured secret-value matches; no production source maps generated.
- Backend has no lint or general test npm script; suite ran directly with `node --test tests/*.test.js`. Initial sandbox worker/build spawn restrictions were resolved by running verification outside the sandbox.
- Browser storage/network behavior was reviewed in source and covered by existing auth/cookie tests; no separate interactive browser inspection was performed.

Changed files: `.gitignore`, `README.md`, `client/.env.example`, `server/.env.example`, `server/src/config/env.js`, `server/src/config/cloudinary.js`, `server/src/config/mailer.js`, `server/src/server.js`, `server/src/utils/logger.js`, `server/tests/env.test.js`, and this review.

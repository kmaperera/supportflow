# Phase 18.10 — File-upload security

## Scope and endpoint audit

Only two upload endpoints exist under `/api/v1`:

| Endpoint | Field / count | Authorization before buffering |
| --- | --- | --- |
| POST `/tickets/:id/attachments` | `attachment`, one file | Authenticated Employee ticket owner, assigned Technician, or Admin; existing writable ticket statuses |
| POST `/tickets/:id/comments/:commentId/attachments` | `attachment`, one file | Same existing comment attachment policy, including trusted parent comment visibility and ticket status |

No profile-photo or KB upload endpoints exist. No `upload.any()` or disk storage exists. Removed the unused five-file helper and its unused validator rather than exposing a new upload feature. GET listing/download and DELETE attachment routes were inspected; their existing authorization remains intact.

## Changes and request boundaries

Before: memory storage, 10 MiB per file, global five-file limit, single-field route restriction, MIME/extension checks after buffering, service authorization after buffering. Other multipart dimensions were unbounded.

After: shared memory storage with `fileSize: 10 * 1024 * 1024`, `files: 1`, `fields: 0`, `parts: 2`, `fieldSize: 1024`, `fieldNameSize: 100`. Busboy signals its parts limit upon reaching that count; two permits the single valid file while extra files/text are rejected by their stricter limits. Text fields are not part of either existing contract, including uploader IDs, URLs, MIME, size, ticket IDs or comment IDs. Route IDs come from validated URL parameters; uploader identity comes from `req.user`.

Order: authentication ? existing params/query/body validation ? ticket/comment authorization ? bounded Multer parser with metadata filter ? buffered-file validation ? existing body validation ? controller/service. Services repeat authorization against current records and file validation before Cloudinary handoff; the early check is not a cached permission grant.

Unsupported extension/MIME is rejected before buffering. Empty files, inconsistent buffer sizes and oversized files are rejected before storage. Malformed multipart is a safe 400; oversized files are 413; unsupported types/signatures are 415; missing files, invalid names, counts and unexpected fields are 422. Responses retain `{ success: false, message, errors: [] }` (route validation can supply field errors). Parser internals and file contents are not returned or logged.

## Allowed types

| Extensions | MIME types |
| --- | --- |
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.png` | `image/png` |
| `.webp` | `image/webp` |
| `.pdf` | `application/pdf` |
| `.txt` | `text/plain` |
| `.csv` | `text/csv`, `application/csv`, `text/plain` |
| `.doc` | `application/msword` |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `.xls` | `application/vnd.ms-excel` |
| `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |

Existing centralized mappings and frontend accept/10 MB guidance agree, so client code is unchanged. Final extensions are case-insensitive. Everything outside the allowlist is rejected, including executable/script extensions, HTML, SVG, standalone archives, DOCM/XLSM and misleading final extensions such as `invoice.pdf.exe`.

PDF, PNG and JPEG require their leading signatures; WebP requires RIFF and WEBP markers. These are shallow format checks, not complete validity checks or protection against polyglots. No decoder or archive parser was added. TXT/CSV and Office files retain MIME/extension validation only. Legacy Office documents can contain macros even without a macro-specific extension. No malware scanner exists; accepted files are not certified safe. No antivirus fixtures or external scanning services were introduced.

## Names, memory, storage and downloads

Names reject null/control characters and values over the existing VARCHAR(255) limit, remove both Windows and POSIX path components, and trim outer whitespace. Names remain display text, never HTML or filesystem paths. Existing React text rendering and download header sanitization remain. Cloudinary storage IDs remain generated independently of filenames, so duplicate names are allowed.

Only one bounded buffer is accepted per request. No buffers are retained in global state, caches or logs; request-local buffers become collectible after completion. No temporary disk files need cleanup. Concurrent request memory is still a deployment capacity concern; the existing API rate limiter remains in place. The JSON 10 KB limit is unchanged.

Cloudinary receives files only after application validation and service authorization. Existing best-effort deletion on DB insert failure remains tested. Cleanup failure can still leave an orphan; reconciliation/lifecycle work belongs to 18.11. A metadata read failure after successful insert does not delete the stored asset.

Application downloads verify ticket/attachment access, send `Content-Disposition: attachment`, a sanitized filename, stored validated MIME, `nosniff` and private/no-store caching. Frontend metadata exposes the protected application download path, not the Cloudinary URL. Underlying public Cloudinary delivery could still bypass application authorization if its URL is obtained elsewhere; review signed/private delivery in 18.11. No resource-type, preset, transformation or delivery-policy changes were made.

## Verification and manual checklist

Focused automated tests use harmless generated PDF, a tiny PNG, text and shallow signature fixtures. Real Express/Multer/service paths run with mocked Cloudinary and attachment persistence. Tests cover valid uploads for each existing role and both endpoints, metadata/list/download contracts, missing/zero/oversized files, unsupported extensions, MIME/signature mismatch, multiple/wrong-field files, unexpected text fields, malformed multipart, traversal/control/long names, and auth rejection before parsing. Existing rollback and download-header tests remain.

Browser fixture verifies trusted-origin authenticated FormData uploads with the unchanged field name and native multipart boundary, plus cookie, refresh, logout, report-header and CORS regressions. No live Cloudinary asset or production document was uploaded.

For Postman, replace illustrative ticket/comment ID `1` with accessible existing records:

- POST `/api/v1/tickets/1/attachments`, form-data `attachment`: valid PDF/PNG ? 201, visible attachment and authorized download.
- POST `/api/v1/tickets/1/comments/1/attachments`: repeat with an accessible public/internal comment according to current permissions.
- Harmless `test.pdf.exe`, mismatched PNG MIME or text renamed PNG with `image/png` ? 415.
- File of 10 MiB + 1 byte ? 413; empty file ? 422.
- File field `malware`, two `attachment` files or text field `uploadedByUserId` ? 422.
- Malformed/missing multipart boundary ? 400 for an authorized request.
- Missing login ? 401; inaccessible ticket/comment ? 404 before multipart parsing. Existing closed/status conflicts remain 409.
- `../../test.pdf` or Windows path filename ? basename only. An HTML-looking filename remains plain text; downloading must not inject headers.

## Files changed

- `src/middleware/upload.js`: bounded single-file parser, early metadata filter and safe parser errors.
- `src/middleware/attachmentValidation.js`: filename normalization and shallow signatures; remove unused multi-file validator.
- `src/modules/tickets/ticketAttachment.service.js`: reusable preauthorization with service rechecks.
- `src/modules/tickets/ticket.routes.js`: validation and authorization before Multer.
- `tests/uploadSecurity.test.js`: new security and valid-workflow coverage.
- `tests/ticketAttachment.test.js`, `tests/inputValidation.test.js`, `tests/authCookie.cdp.mjs`: adapt existing fixtures to early authorization.
- `UPLOAD_SECURITY.md`: audit, limits, limitations and test checklist.

No client, schema, business permission, session, CORS, rate-limit, Cloudinary policy or later-phase audit feature changes.

## Final results

- `node --test tests/*.test.js`: 341 passed, 0 failed, 1 existing opt-in MySQL historical-attribution test skipped (342 total).
- `node tests/authCookie.cdp.mjs`: passed in isolated headless Edge, including authenticated multipart upload and browser CORS/cookie regressions.
- `npm start` on port 5101: successful startup and MySQL connection; stopped after verification.
- No backend lint/build script is configured. Client was unchanged, so frontend build/lint was not required.
- `git diff --check`: passed. Upload storage/persistence assertions use mocks, not live Cloudinary writes.

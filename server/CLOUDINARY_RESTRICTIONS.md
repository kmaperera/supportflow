# Phase 18.11 — Cloudinary file restrictions

## What changed

Only `server/` changed. Ticket and comment attachments are the only Cloudinary-backed upload features. Profile image URL fields exist, but no profile-file upload/replacement or KB-file upload exists. No new upload feature, preset, transformation, unsigned browser upload, credential rotation, broad IDOR audit or later audit-log feature was introduced.

| File | Change |
| --- | --- |
| `src/services/cloudinaryUpload.service.js` | Revalidate locally; explicit resource/format policy; fixed folder, UUID IDs, authenticated delivery, no overwrites, provider timeout, response checks and cleanup |
| `src/services/attachmentDownload.service.js` | Server-only expiring signed downloads for both new and legacy assets; stop fetching stored URLs |
| `src/modules/tickets/ticketAttachment.repository.js` | Persist/read delivery type with bound parameters |
| `src/modules/tickets/ticketAttachment.service.js` | Pass trusted delivery metadata through persistence/deletion/rollback; log cleanup failures; minimize public response |
| `database/migrations/021_add_attachment_delivery_type.sql` | Add delivery type; default existing assets to their original `upload` type |
| `tests/cloudinaryRestrictions.test.js` | Provider-option, signature-expiry, metadata, cleanup and response tests |
| `tests/ticketAttachment.test.js`, `tests/uploadSecurity.test.js` | Update download/provider fixtures and retain attachment regressions |
| `CLOUDINARY_RESTRICTIONS.md` | This review and deployment checklist |

## Feature and policy map

Both POST `/api/v1/tickets/:id/attachments` and POST `/api/v1/tickets/:id/comments/:commentId/attachments` retain authentication, early authorization, Phase 18.10 local validation, then Cloudinary upload, then MySQL metadata insertion. One file under the `attachment` field, maximum 10 MiB; no multipart text fields. Caller-supplied folder, public ID, delivery type, transformations, MIME or size fields are not accepted by the API.

| Validated class | New Cloudinary resource type | Cloudinary allowed format |
| --- | --- | --- |
| JPG/JPEG | `image` | `jpg` |
| PNG | `image` | `png` |
| WebP | `image` | `webp` |
| PDF, TXT, CSV, DOC, DOCX, XLS, XLSX | `raw` | The single validated extension for that upload |

The existing centralized Phase 18.10 MIME/extension map remains authoritative. The provider helper calls that validator again, then derives its format from the validated final extension (JPEG canonicalizes to JPG). It never requests format conversion. SVG, HTML, scripts, executables, arbitrary archives and macro-specific extensions remain rejected locally before the SDK runs. Legacy `video` metadata is supported only for deleting/downloading old assets; new uploads cannot choose it.

All new assets use fixed server-defined `supportflow/tickets`, with a fresh `crypto.randomUUID()` identity. Raw IDs include their safe extension; image IDs omit it. The filename sent in the provider multipart request is also generated, so original names do not leak through URLs or provider upload filenames. The user-facing filename remains in MySQL. No email, ticket title, username, comment, context or tags are added to Cloudinary metadata.

`overwrite: false`, `use_filename: false`, `unique_filename: true` are explicit. The existing `folder` API is retained for compatibility with fixed-folder environments and migrated dynamic-folder environments; no account-mode change is assumed. Cloudinary documents the compatibility behavior in [Folder modes](https://cloudinary.com/documentation/folder_modes).

## Delivery before and after

Before: `resource_type: auto`, default public `upload` delivery. The attachment API already withheld the permanent storage URL/public ID. SupportFlow proxied the stored URL after authorization and used a signed fallback only for 401/403 provider responses. Possession of an underlying public asset URL could bypass SupportFlow authorization.

After: every new upload requests `type: authenticated`. Both originals and derivatives require a signature/access token under Cloudinary's documented [authenticated delivery model](https://cloudinary.com/documentation/control_access_to_media). No fallback to public upload is attempted if the provider rejects this policy.

GET `/api/v1/tickets/:id/attachments/:attachmentId/download` still authorizes the current user and attachment, then delivers the bytes itself. The backend generates `private_download_url` with the stored public ID, resource type, delivery type, attachment disposition and a **60-second expiry**. The URL remains server-side; the browser gets neither a redirect nor JSON containing the URL. The SDK supports authenticated and legacy upload types for this API: [Upload API reference](https://cloudinary.com/documentation/image_upload_api_reference).

The proxy no longer fetches the DB `file_url`. It bounds transfer size to 10 MiB, uses a 30-second abort signal and refuses redirects. Existing application-controlled safe filename, `Content-Disposition: attachment`, stored validated MIME, `X-Content-Type-Options: nosniff` and private/no-store caching remain intact.

Attachment responses contain application metadata and `downloadPath`. Removed the unused `resourceType` response field. Public ID, permanent URL, delivery type, SDK signature/version/API fields and signed URLs are not exposed. Client code never consumed `resourceType`, so no client edits were needed. Existing Blob download, loading and error UX remains intact.

## Migration and legacy assets — important

Apply migration **021 before deploying this code** in each environment. It was applied and verified on the configured **local development database** during this task. No remote Cloudinary assets were changed.

Existing rows default to `delivery_type = 'upload'`, correctly describing their existing remote assets. New rows explicitly persist `authenticated`. Upload, download, destroy and compensating cleanup use the correct stored type. Defaulting all legacy rows to authenticated would break their access and deletion without changing the actual remote assets.

**Existing public assets remain public by possession of their old URLs.** Signing the application's downloads does not revoke those URLs. A controlled legacy migration is still required before claiming every historical attachment is private:

1. Inventory legacy rows by `delivery_type = 'upload'` without publishing their URLs or content.
2. In a staging environment, verify the account's supported operation for moving/copying assets to authenticated delivery, preserving bytes and resource type.
3. Update each DB reference/type only after its protected replacement is confirmed downloadable. Retain recovery information until verification succeeds.
4. Remove/invalidate the old public asset only after successful replacement; verify that old unsigned URLs no longer retrieve it (allow for CDN invalidation delay).

This task did not bulk mutate or delete historical user documents. The SQL migration alone does not migrate remote assets.

## Provider boundaries, errors and lifecycle

Cloudinary configuration already centrally requires cloud name, API key and API secret, with `secure: true`; no fallback credentials or TLS bypass exists. Cloudinary secret/preset/direct-upload searches found no client usage. No credentials were printed or changed.

New upload SDK calls explicitly time out after 30 seconds using the installed SDK's request timeout; deletion uses the same timeout. Downloads have a 30-second AbortSignal. No automatic upload retry was introduced. SDK HTTPS communication is retained.

Successful responses must match the generated public ID, expected resource type and authenticated delivery and include an HTTPS URL within the DB length limit. Only minimal metadata and the locally measured byte count are returned. Unexpected successful responses trigger best-effort cleanup against the generated identity; provider errors become safe 502 application messages. Cleanup failures log a category only, without URLs, document content, credentials or raw provider errors.

On DB insert failure, delete the newly uploaded asset with its resource and delivery type; preserve the original DB failure. Failed cleanup is now observable rather than silently swallowed. No destructive cleanup occurs merely because a later metadata read fails after a successful insert.

DELETE uses route attachment ID ? DB lookup ? existing permission checks ? stored public ID/resource/delivery type ? Cloudinary destroy with cache invalidation ? DB deletion. Provider failure preserves the row. `not found` is safe for retries if a prior remote delete succeeded but DB deletion failed. Client public IDs never control deletion. No replacement feature exists.

MySQL and Cloudinary are not transactional together. Failed compensation, uncertain network timeout outcomes or inconsistent provider responses can still require manual orphan reconciliation. No background cleanup/retry infrastructure was added.

## Manual Cloudinary Dashboard / staging checks

Account configuration was not queried or modified. Before production release:

- Verify authenticated **image and raw** upload/download support for this account. Test a harmless real PDF and PNG through SupportFlow and confirm unsigned original and transformed URLs fail when logged out. This was not verified against the live provider here.
- Confirm `supportflow/tickets` folder placement under the account's folder mode. Preserve generated public IDs when moving assets.
- Disable unused unsigned presets. The application uses no named preset or direct browser upload. Inspect any account default preset for unexpected transformations, conversions, naming, tags or public access rules.
- Where account/preset controls provide format/size restrictions, mirror the table above and 10 MiB limit. No undocumented upload size parameter is assumed; local Multer/buffer limits remain authoritative.
- Confirm PDF/raw delivery settings allow the intended authenticated server download without enabling unnecessary public delivery.
- Verify legacy migration and cache invalidation before declaring historical files protected.
- Keep credentials backend-only with the least account privileges required for upload, signed download and destroy. No key rotation was performed.

No transformations or image decoding were added. Original files may retain EXIF/other metadata; metadata stripping is not claimed. MIME checks and signatures are not malware scanning; Office/PDF content can still be unsafe. Signed private downloads use the provider API and may have different bandwidth costs from cached CDN delivery; monitor actual account usage.

## Tests and results

- `node --test tests/*.test.js`: **346 passed, 0 failed, 1 existing opt-in MySQL test skipped** (347 total).
- Focused Cloudinary/attachment suites: **25 passed**. Generated PDF/tiny PNG/text fixtures check fixed folders, unique IDs, MIME/resource/format selection, filename confidentiality, no overwrite, response minimization, rejected files never reaching Cloudinary, short signed expiry, stored-URL avoidance, safe provider failures and delivery-aware rollback/deletion.
- Existing Employee/Technician/Admin direct/comment attachment upload/list/download, status/visibility rules, wrong-field/privileged metadata rejection, oversized files, safe headers and failure regressions remain covered. Broad IDOR testing was not started.
- `node tests/authCookie.cdp.mjs`: passed in isolated headless Edge, including authenticated multipart upload, readable report filenames, cookie/refresh/logout and CORS regressions.
- Migration 021 applied locally; NOT NULL column and legacy `upload` default verified.
- `npm start`: successful MySQL connection and server startup on port 5101; stopped after verification.
- `git diff --check`: passed. No backend lint/build script is configured. Client unchanged; frontend build/lint was not required.

Cloudinary operations are mocked in automated tests. No live provider asset upload, authenticated direct-access/expiry test, delete or CDN-invalidation test is claimed. Complete the staging checks above using harmless files and the real account before production rollout.

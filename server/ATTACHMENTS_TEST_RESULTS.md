# Phase 19.10 - Attachments Testing

**PASS after fixing one reproduced filename defect**, with the legacy delivery limitation below. No Phase 19.11 work started.

| Requested check | Result | Evidence |
| --- | --- | --- |
| Employee upload | PASS | Actual HTTP/MySQL upload; correct ticket, uploader, name, bytes, timestamp; one UI row. |
| Technician upload | PASS | Assigned technician uploads; correct uploader; list refreshes. |
| Admin access | PASS | Existing Admin upload and authorized download API supported and tested. Admin detail UI does not provide attachment controls. |
| Allowed file types | PASS | Every extension/MIME pair in the existing allowlist accepted through HTTP validation with harmless fixture bytes. |
| Blocked extensions | PASS | EXE, HTML, JS, SVG, BAT and PDF.EXE return 415 before provider call or DB insertion. Existing unit tests cover additional blocked classes. |
| MIME/extension validation | PASS | Mismatched declared MIME and incorrect PDF/PNG/JPEG/WEBP signatures rejected; existing Office/text validation policy preserved. |
| Size limits | PASS | Configured 10 MiB limit; 10 MiB minus one byte succeeds; limit plus one returns 413 without provider/DB effects. Zero-byte file returns 422. |
| Filename/path safety | PASS | Spaces, parentheses, apostrophe, UTF-8 accents/emoji, long names and HTML-like names; traversal reduced to basename; control characters rejected; safe download headers. |
| Attachment listing | PASS | Correct safe metadata, repeated retrieval/reload persists; tied timestamps ordered by ID; internal-comment attachments excluded by backend for Employee. |
| Authorized download/streaming | PASS | Employee, assigned Technician and Admin receive exact expected bytes through actual HTTP; correct MIME, attachment disposition, nosniff and private/no-store. Actual browser Blob bytes/filename checked. |
| Employee ownership | PASS | Other Employee cannot upload/list/download; rejected operations make no attachment/provider mutations. |
| Technician authorization | PASS | Wrong assigned Technician cannot upload/list/download. |
| Nested-resource protection | PASS | Attachment ID under another ticket returns 404; comment/ticket mismatch rejected; knowing IDs does not bypass ownership. |
| Cloudinary resource/folder/public-ID handling | PASS (mocked SDK) | Existing real helper tests assert explicit image/raw types, authenticated delivery, fixed supportflow/tickets folder, generated UUID identities, narrow allowed formats, HTTPS, minimal metadata and sanitized errors. |
| Direct URL policy | KNOWN LIMITATION | New upload helper requires authenticated assets; API/UI expose only SupportFlow download paths. Read-only SQL inspection found **7 legacy delivery_type=upload records**. Their live provider URL accessibility was not tested; legacy assets were not migrated or changed. |
| Provider/DB failure cleanup | PASS (controlled failures) | Provider failure creates no DB row; DB insertion failure calls compensating deletion with trusted ID/type/authenticated delivery. Existing tests cover incomplete cleanup, SDK failure and invalid response cleanup. |
| Missing provider asset | PASS (mocked upstream) | Existing real download-helper test simulates upstream 404 and verifies safe 502 error; oversized transfers are bounded. No live provider asset was deleted. |
| UI loading/error/query refresh | PASS | Pending controls, duplicate submission prevention, retained file after failure, no phantom row, automatic list refresh, safe download error, reload, keyboard focus/submit and 320/375/430 px layouts. |
| Lifecycle interaction | PASS | RESOLVED/CLOSED uploads return 409; stale UI upload after resolution rejected; history remains readable. Uploads/downloads do not change lifecycle. |
| Comment integration | PASS | Public comment attachment linked to correct comment/ticket; internal attachment visibility enforced by backend. |
| Notifications/audit | PASS / no new policy | Attachment upload has no notification or audit event in current implementation. Actual upload snapshots verify no extra notifications/status history. No logging or delivery feature added. |

## Reproduced defect and focused change

An actual browser-style FormData upload of `Employee résumé (safe).txt` returned/stored `Employee rÃ©sumÃ© (safe).txt`. The installed multipart parser used Latin-1 for an unqualified filename parameter, while browsers transmit UTF-8.

`server/src/middleware/upload.js` now sets Multer `defParamCharset: "utf8"`. The existing HTTP multipart test adds a filename containing accents, apostrophe, Chinese characters and emoji, asserting that the parsed name reaches the attachment service unchanged. Actual HTTP/MySQL and Chrome upload checks confirm the name survives persistence and UI rendering. Provider identities and download-header sanitization are unchanged; the browser save action retains the original UTF-8 filename.

## Verification

- Backend, from `server/`: `node --test tests/*.test.js` - **439 passed, 1 existing opt-in reports DB test skipped**, zero failures. Includes attachment validation, ownership/visibility, multipart parser, provider restrictions, cleanup and download regression tests.
- Temporary focused local HTTP/MySQL harness - **56 checks passed**. Fixture users/tickets/attachments and mutations rolled back; no live Cloudinary upload/download or private file used.
- Temporary actual Chrome/React harness - **6 attachment workflow checkpoints passed**, covering Employee and Technician uploads, filename rendering, pending/error states, duplicate clicks, download bytes/name, mobile layouts, refresh and lifecycle controls. File objects and downloaded bytes remained in memory; no browser download artifact retained.
- Client, from `client/`: `node tests/ticketAttachments.smoke.mjs` and `node tests/attachmentDownload.smoke.mjs` - passed, including object URL revocation and passive preview restrictions.
- Actual backend startup and `/api/v1/health` - **server UP, database UP**.
- Backend package has no generic npm test or lint script; full available Node suite used. Source syntax check and final `git diff --check` passed.
- Frontend source unchanged; frontend build/lint not required or run for this fix.

Live Cloudinary delivery, account configuration and direct legacy URLs are **NOT TESTED**. Provider contracts/failures use existing SDK/fetch doubles; HTTP/MySQL authorization, metadata and binary response checks are real. Image/PDF signatures are shallow; Office/text types use the established extension/MIME policy, not deep document decoding or malware scanning. Single-file upload policy is retained; sending two files was also tested and rejected with 422.

## Files and working tree

- Modified: `server/src/middleware/upload.js` - UTF-8 multipart filename decoding.
- Modified: `server/tests/ticketAttachment.test.js` - focused real-parser regression.
- New: this report.

Temporary harnesses/logs/browser profile removed. Final working tree has **2 modified files and 1 new report**. No commit created.

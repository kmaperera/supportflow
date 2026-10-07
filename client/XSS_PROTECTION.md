# Phase 18.3 — XSS protection

## Findings and changes

The application renders user content as plain text. The production source audit found **zero** occurrences of `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(...)`, or `new Function(...)`. No markdown or rich-HTML renderer is installed in the current rendering path. No global input stripping, HTML encoding at storage time, or sanitizer dependency was added.

One navigation risk was found: attachment Open previously navigated to a same-origin Blob URL regardless of the response MIME type. An HTML/SVG response could become an active document. `openAttachment` now allows JPEG, PNG, WebP, PDF and plain text previews; CSV is retyped as plain text. HTML, SVG, XHTML, unknown and missing types are download-only. The UI explains that Download remains available. Existing authenticated retrieval, download filenames, popup isolation and URL cleanup are preserved. This is a browser preview restriction, not file-content verification or upload hardening.

## Rendering audit

| Area | Output handling |
| --- | --- |
| Employee, Technician and Admin tickets | Titles, descriptions, resolution text, public comments and internal notes use React text; multiline text keeps existing whitespace styling. |
| Users, profile, categories and assignment controls | Names, email addresses, option/combobox labels and form defaults use JSX text or controlled input values. |
| Knowledge Base | Article titles and content are plain text; article content retains `whitespace-pre-wrap`. No HTML conversion or markdown interpretation. |
| Notifications and realtime toasts | Socket/API strings reach React text in notification cards and the shared toast component, never HTML. |
| Errors and confirmation dialogs | Dynamic title/message/description values are React text. |
| Reports and audit logs | Cell values and descriptions are text. Metadata uses JSON serialization inside a React `pre`; the existing API adapter also restricts metadata to supported fields. Unknown fixture metadata was filtered, not rendered. |
| Charts, SLA/config and badges | Labels/summaries are React text; styling comes from fixed classes/maps or CSS variables, not arbitrary user CSS. |
| Attachments | Filenames and accessibility labels use React text/string props. Filenames are never HTML. |
| Search, route and browser state | Search/form values remain text. IDs in navigation paths are encoded beneath fixed route prefixes. Theme storage is normalized to light/dark. Document titles use the text property. No browser-state-to-HTML sink found. |

React escaping protects both stored and reflected strings at these output boundaries without corrupting names, punctuation or technical content. Accessibility text uses the same safe string props. These findings do not claim protection for future HTML rendering features.

## URLs and server output

- Attachment download metadata must match the expected authenticated `/api/v1/tickets/{ticketId}/attachments/{attachmentId}/download` path. Arbitrary `javascript:`, `vbscript:`, `data:`, `blob:` and protocol-relative paths are rejected. Cloudinary URLs are not used as clickable preview destinations.
- Article/ticket/profile navigation uses application routes. The new-tab article link retains `noopener noreferrer`. No user website link or profile image URL is currently rendered; profile uses initials.
- Downloads use locally created Blob URLs and the anchor's `download` property. Report export MIME/signature checks and filename handling remain unchanged. Blob URLs are not globally allowed as user-provided destinations.
- Notification email templates already escape `&`, `<`, `>`, quotes and apostrophes in every dynamic HTML text insertion. Their markup/styles are static; there are no dynamic email links. Plain-text emails remain plain text. Existing single-line template-context normalization is preserved. New tests exercise full payloads across all supported event types.
- CSV formula injection is separate from browser XSS. The existing CSV helper prefixes dangerous formula-like text while preserving numeric values; its tests pass. No CSV behavior was changed.

## Verification

The existing browser fixture was extended with an opt-in `?xss=1` mode, using actual app components and mocked API responses without writing malicious records to the database. `tests/xss.cdp.mjs` reuses the project's Edge DevTools testing approach; no testing framework was installed.

Nineteen routes passed: Employee ticket list/detail, Technician assigned/unassigned/detail, Admin ticket list/detail, Employee KB list/detail, Admin KB/categories/users, Employee profile, all three notification pages, Admin reports/audit/analytics. The same payload-bearing ticket/comment/category data is supplied across roles. Assertions check literal output, absence of injected elements/unsafe links, zero payload execution, toast/dialog output, KB whitespace behavior and no browser console errors/warnings.

Payloads include script elements, image `onerror`, SVG `onload`, and an anchor containing a `javascript:` URL. Legitimate `O'Connor`, `C++`, `<5 minutes`, and `A & B` remain intact. Fixture descriptions/articles contain line breaks; email tests also cover a code snippet and a normal HTTPS URL. This is automated cross-role rendering verification, not a live account-to-account database mutation test or a claim of exhaustive penetration testing.

Results:

- `client`: `npm run build` passed (existing bundle-size warning); `npm run lint` passed.
- `client`: `node tests/attachmentDownload.smoke.mjs` passed, including unsafe preview MIME rejection and unchanged CSV text bytes.
- `client`: `node tests/ticketAttachments.smoke.mjs` passed, including malicious URL-scheme rejection.
- `client`: `node tests/xss.cdp.mjs` passed against local Vite and isolated headless Edge (CDP port 9223, configurable with `KEYBOARD_CDP_PORT`).
- `server`: `node --test tests/notification.emailTemplates.test.js tests/csv.test.js` passed, 8 tests.
- `server`: `npm start` reached a successful MySQL connection and listening state on temporary port 5093. No backend lint script exists.

To rerun the browser checks, start Vite on port 5173 and an isolated Chromium/Edge instance with remote debugging on port 9223, then run the CDP script from `client/`. The script closes its own test tab.

## Files changed

- `client/src/pages/employee/attachmentDownload.js`: preview type restriction and CSV text preview.
- `client/src/pages/employee/TicketAttachments.jsx`: download-only preview feedback.
- `client/tests/attachmentDownload.smoke.mjs`: preview rejection and content-preservation checks.
- `client/tests/ticketAttachments.smoke.mjs`: unsafe URL scheme cases.
- `client/tests/polish.fixture.jsx`: opt-in hostile text fixture and shared message/dialog controls.
- `client/tests/xss.cdp.mjs`: cross-role browser rendering regression.
- `server/tests/notification.emailTemplates.test.js`: full email payload regressions.
- `client/XSS_PROTECTION.md`: this audit and verification record.

## Scope boundaries

Helmet/CSP and security headers remain Phase 18.4. File signatures, upload MIME enforcement and Cloudinary restrictions remain 18.10/18.11. No rate limiting, CORS, cookies, session/JWT, permissions, database schema, business workflow, or new audit subsystem work was added. No backend production code or storage representation changed.

# Phase 17.9 — Form validation UX

Added `FieldError.jsx` for consistent wrapping inline alerts and
`formValidation.js` for first-invalid-field focus and safe field-error mapping.
The shared invalid-control style follows aria-invalid only, so untouched required
fields remain neutral. Existing controlled submit validation and correction
handlers remain in place; no form library was introduced.

## Changes

- Login/password change reuse FieldError while retaining credential errors at
  form level, existing password rules, visibility controls and focus behavior.
  Profile is read-only; no new profile form was invented.
- Ticket creation/edit use consistent linked field errors. Empty title and
  description now have explicit required messages; existing length/ID validation
  and first-invalid focus remain authoritative for simple client checks.
- Replies/internal notes distinguish whitespace-only text from over-limit text,
  focus the composer and show required labels. Internal notes mirror the known
  5,000-character maximum. Resolve validation focuses the required note.
- Upload validates the existing type/10 MB restrictions, focuses the file input
  on invalid submit, and exposes required/invalid semantics. No upload contract
  or file limits changed.
- Create User, ticket/KB category, KB article and SLA forms focus their first
  invalid field. User/KB inputs mirror confirmed backend maximum lengths where
  added; KB content has no invented maximum. Duplicate email appears once beside
  email and entered values remain intact.
- Role changes cannot open confirmation for unknown/unchanged roles. Assignment
  retains its loaded-technician and same-technician checks, with required label
  and selection guidance. No backend business-rule checks were replaced.
- Report generation is disabled for invalid dates with explanatory text. Date
  blur/submit shows linked errors, and changing either boundary revalidates
  existing date errors. The existing report validator is reused by generation
  and exports; stale-results/export guards remain unchanged.
- Shared server mapping accepts only a 422 errors array and explicitly allowed
  field names. It handles the existing envelopes with omitted or false success;
  successful envelopes are ignored. Unknown/null entries and raw server messages
  are never rendered. Existing specialized mappings remain in place elsewhere.

Backend sources inspected included user validation, ticket validation/comment
validation, KB category/article validation and middleware/validate.js (`field`
comes from the validator path). Existing API trimming is preserved for names,
titles and category names. No new transformation of long-form content.

## Files changed

- Added `src/components/FieldError.jsx`, `src/components/formValidation.js`.
- Updated `src/index.css`.
- Auth pages: `LoginPage.jsx`, `ChangePasswordPage.jsx`.
- Employee pages: `CreateTicketPage.jsx`, `EditTicketForm.jsx`,
  `createTicketValidation.js`, `TicketConversation.jsx`, `TicketAttachments.jsx`.
- Technician pages: `TicketInternalNotes.jsx`, `TicketResolveControl.jsx`.
- Admin pages: `CreateUserPage.jsx`, `CategoryFormPage.jsx`,
  `KbArticleFormPage.jsx`, `KbCategoryEditor.jsx`, `kbPresentation.js`,
  `SlaSettingsPage.jsx`, `UserManagementPage.jsx`, `AdminTicketAssignment.jsx`,
  `AdminReportsPage.jsx`.
- Added `tests/formValidation.smoke.mjs`, `tests/validation.browser.html`, and
  this document.

## Verification and scope

Build/lint passed (existing large-chunk warning remains). Fourteen focused smoke
suites passed: formValidation, createUser, categories, adminKnowledgeBase,
slaPolicies, reports, reportExports, changePassword, editTicket,
technicianResolve, ticketConversation, internalNotes, ticketAttachments,
adminAssignment. Headless Chrome passed initial-neutral state, failed-submit
focus, error associations, correction and value-preservation checks. Serve Vite
and visit `/tests/validation.browser.html` to repeat the browser fixture.

No live backend mutation was performed. Loading guards, safe persistent errors,
success toasts and confirmations are preserved. Validation failures stay inline.
No backend, permission, workflow, auth/token, socket, pagination or search-system
changes were made.

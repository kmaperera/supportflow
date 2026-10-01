# Phase 17.7 — Toast notifications

One `ToastProvider` is mounted in `main.jsx`, outside AuthProvider so completed
password/session actions can survive navigation. `useToast()` exposes success,
error, info and warning methods. No dependency was added.

Success/info dismiss after 5 seconds, error/warning after 8 seconds. Identical
type/message pairs are suppressed for 6 seconds. At most four toasts appear.
Hover or keyboard focus pauses dismissal; leaving restarts the duration. Each
toast cleans its timer on removal/unmount, including React StrictMode replay.
Toasts have no animation and therefore do not require motion. They sit below
the top navigation, inset on mobile and at the right on desktop, with wrapping
text, explicit type labels, live status/alert semantics and labelled dismiss
buttons. They never take focus automatically.

## Integration

Existing `AuthFeedback` success messages now publish through the shared context
instead of leaving duplicate inline banners. Errors remain inline. Without a
provider, isolated component consumers retain the original inline fallback.
Normal sign-in feedback explicitly stays inline. Pages do not manage toast
arrays and query/empty states do not generate toasts.

- Employee: ticket creation/editing, closing/reopening, replies, attachments,
  and successful support rating.
- Technician: self-assignment, status/priority changes, resolution, replies,
  internal notes and uploads.
- Admin: assignment/reassignment/unassignment, user creation/status/role,
  ticket and KB category actions, article creation/editing/publication/archive,
  and SLA policy saves.
- Auth: password-change feedback and logout-all success. Profile has no update
  form, so no profile mutation was invented.
- Notifications: mark-all success only; individual read/open behavior unchanged.
- Exports: after the validated blob is handed to the browser, show CSV/PDF
  download started. Safe export errors also toast and retain inline feedback.
  Report generation itself does not toast.
- Realtime: the existing inbox subscription optionally reports deduplicated
  events. Only technician/admin SLA warning/breach events toast using fixed
  safe text. This is active while the inbox is mounted; no new global socket or
  room behavior was introduced. Workflow events are not echoed as realtime
  toasts to avoid duplicating local mutation feedback.

Validation, stale-assignment conflicts and query failures remain persistent.
Existing conflict refetches, draft preservation, loading/skeletons and empty
states are unchanged. No confirmation-dialog or validation-UX work was added.

## Files

- Added `src/components/ToastProvider.jsx`, `src/components/toastContext.js`.
- Updated `src/main.jsx`, `src/auth/AuthFeedback.jsx`, `src/auth/SessionActions.jsx`.
- Updated `src/pages/auth/LoginPage.jsx`.
- Updated employee `MyTicketsPage.jsx`, `TicketConversation.jsx`,
  `TicketAttachments.jsx` and technician `TicketInternalNotes.jsx`.
- Updated admin `UserManagementPage.jsx`, `SlaSettingsPage.jsx`,
  `ReportExportActions.jsx`.
- Updated `src/pages/shared/NotificationsPage.jsx`, `src/api/notificationRealtime.js`.
- Added `tests/toasts.browser.html`; updated `tests/notificationRealtime.smoke.mjs`.
- Added this document.

## Verification

`npm run build` and `npm run lint` passed. The existing large-chunk warning
remains. The browser fixture passed in headless Chrome with StrictMode,
deduplication, stack bounds, all types, text escaping, manual/automatic dismissal,
focus pause and unmount cleanup. Serve with Vite and open
`/tests/toasts.browser.html`; the result becomes PASS after about 18 seconds.

Twelve smoke suites passed: notificationRealtime, notifications, reportExports,
adminAssignment, users, slaPolicies, ticketConversation, ticketAttachments,
internalNotes, changePassword, emptyStates and errorStates. Tests mock contracts;
no live backend mutations were performed.

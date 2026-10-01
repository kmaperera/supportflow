# Phase 17.8 — Confirmation dialogs

`src/components/ConfirmDialog.jsx` is a shared, dependency-free native HTML
dialog. Props: open, title, description, confirmLabel, cancelLabel, variant
(default/warning/destructive), pending, pendingLabel, onConfirm, onCancel, and
children for contextual details/errors. `showModal()` supplies background
inertness and modal focus containment. Cancel receives initial focus. Cleanup
restores body scrolling and the opener's focus when that element still exists.
Escape cancels only before submission; backdrop clicks do not dismiss.

Confirm has a synchronous duplicate-click guard and disables both actions while
awaiting the handler. The caller closes on success or deliberately resets on
stale state. Existing handlers remain responsible for safe mutation errors.
The dialog uses labelled title/description, native dialog semantics,
aria-modal/aria-busy, viewport-limited scrolling, wrapped copy and stacked mobile
actions. No animation or modal dependency was introduced.

## Actions

- Employee Close Ticket and Reopen Ticket replace native browser confirmations.
  Normal failures remain inside the dialog; 409 resets it and retains existing
  conflict feedback/refetches.
- Logout All Sessions replaces the native confirmation for every role. Normal
  logout stays immediate.
- Admin assignment/reassignment uses the existing selector then the shared
  dialog. Cancel preserves the selected technician. Errors retain the existing
  action-level feedback and refresh behavior.
- Unassignment retains the assignment ID captured on opening. It never retries
  using a newer ID automatically. Successful mutation closes; 403/404/409 safely
  reset and refetch. Other failures retain the confirmation and inline error.
- User role changes and deactivation use warning/destructive dialogs. Selected
  role survives dialog cancellation. Failures remain visible; activation stays
  immediate.
- Ticket category deactivation explains availability for new tickets and
  preservation on existing tickets. Activation stays immediate.
- KB archive uses a warning dialog. KB category deactivation explains that its
  articles become hidden from employees/technicians until reactivation.
  Publication and activation remain immediate.
- Technician resolution already has a dedicated required-note form. Its
  redundant inline second confirmation was removed; validation, pending label,
  draft/error handling and backend calls are unchanged. No dialogs were added
  for self-assignment, ordinary status/priority changes or replies.

Existing 17.6 error states and 17.7 success toasts are preserved. Backend
authorization, API bodies, transitions, filters and pagination are unchanged.
No new delete actions, validation redesign or later-phase UI was added.

## Files changed

- Added `src/components/ConfirmDialog.jsx`.
- `src/auth/SessionActions.jsx`.
- `src/pages/employee/CloseTicketButton.jsx`, `ReopenTicketButton.jsx`.
- `src/pages/technician/TicketResolveControl.jsx`.
- `src/pages/admin/AdminTicketAssignment.jsx`, `UserManagementPage.jsx`,
  `CategoryManagementPage.jsx`, `AdminKnowledgeBasePage.jsx`.
- Added `tests/confirmation.browser.html` and this document.

## Verification

Build and lint passed; the existing >500 kB bundle warning remains. No native
window.confirm calls remain in client source.

Headless Chrome passed the browser fixture: StrictMode modal opening, safe
initial focus, backdrop behavior, duplicate prevention, pending Escape guard,
failure retention, cancellation, focus/scroll restoration and cleanup. Serve
with Vite and open `/tests/confirmation.browser.html` to repeat it.

Eleven smoke suites passed: adminAssignment, users, categories,
adminKnowledgeBase, closeTicket, reopenTicket, technicianResolve, logout,
profile, reportExports and errorStates. These verify contracts and rendering;
no live backend mutations were performed.

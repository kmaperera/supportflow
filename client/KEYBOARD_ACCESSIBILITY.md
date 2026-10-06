# Phase 17.14 — Keyboard Accessibility

All changes are inside client/. This phase changes focus and keyboard interaction only. Backend/API contracts, authentication, validation rules, ticket workflows, mutation eligibility, filters, pagination and Light/Dark state remain unchanged. No screen-reader deep audit, mobile navigation redesign or final visual polish was started.

## Audit and changes

### Semantic controls and whole cards

Audited auth, Employee, Technician, Admin and shared components for click handlers, keyboard handlers, tabindex, hidden UI and focus styling. Existing actions use native buttons; ticket and KB navigation uses links. Whole-card ticket links remain semantic, and the Technician card's sibling action region remains outside its link. No clickable div conversion was necessary.

The custom technician list retains listbox options controlled through its focused input; the clickable option rows are not separate tab stops. Native selects, attachment file inputs, multiline composers and metadata details/summary are retained. No positive tabindex or new global shortcut is introduced.

### Visible focus

index.css supplies one two-pixel focus-visible outline with a three-pixel offset for buttons, links, fields, summaries and explicit focus targets. Its teal color changes for Light/Dark. Existing validation borders, special card focus treatment, disabled states and Clear filters cursors remain intact. Decorative badges/icons do not receive tab stops.

### Sidebar, skip links and navigation

All three role shells reuse `layouts/SkipLink.jsx` and target a stable `main-content` main element using PageContainer's existing tabindex=-1. Activating the link explicitly focuses main content. Collapsed navigation stays display:none; opening/closing and current navigation styling are unchanged.

`NavigationFocus.jsx` is mounted once in App. It focuses main after pathname navigation, not filter/query-only updates or initial rendering. A small child-list observer recovers focus to main only if the last focused element was detached and focus fell to body; it does not steal focus from surviving fields, active controls or open dialogs. This covers removed queue rows and filtered account/category rows without changing mutations. Observers/listeners clean up on unmount.

### Forms, search and filters

Native Tab/Shift+Tab and Enter submission remain. Native selects preserve arrow-key behavior. Clear filters remains a native button; disabled controls are skipped. Existing Phase 17.9 first-invalid-field behavior is retained. Audit filter submission now focuses its first invalid field in field order using the existing helper; validation rules are unchanged. Normal textarea Enter remains a newline. Native file inputs remain keyboard reachable.

### Technician combobox

Fixed ArrowUp from no active option, and reopening with Enter/Space/arrows. ArrowDown starts at the first eligible option; ArrowUp starts at the last; current technician is skipped. Arrows wrap through eligible options and Enter selects. Escape closes without clearing the selection or search criteria; Tab closes and continues normal tab order. Space is normal search text while open. Input focus stays put and options stay outside the tab sequence. Search filtering and assignment payloads remain unchanged.

### Confirmation dialogs

Native showModal behavior remains, with a lightweight explicit Tab/Shift+Tab boundary trap using visible, enabled tab stops. Cancel remains the initial safe focus target. When pending disables all controls, the dialog itself retains focus and traps Tab. Escape stays blocked while pending; there is no unsafe backdrop dismissal. On close, focus returns to the opener when it is available and enabled, or to main content when it has disappeared/been disabled. Existing duplicate-confirm protection is retained.

### Other interactions

- The Light/Dark toggle uses only native button activation; Enter and Space each toggle once.
- Pagination buttons, current/disabled page behavior and row/ticket/KB action buttons retain native activation and existing logic.
- Tables retain only their existing interactive actions and scroll-region stops, not per-cell tabindex.
- Metadata uses native details/summary. Toasts never programmatically focus themselves; dismiss buttons remain tabbable.
- Reports retain logical native criteria, Generate, export and pagination controls.
- Recharts accessibilityLayer is disabled only for charts already marked aria-hidden and paired with a visible values list, avoiding an invisible chart tab stop. Chart data, tooltip presentation and series are unchanged; full chart alternatives remain outside scope.

## Verification

- `npm run build`: passed; existing bundle-size warning remains.
- `npm run lint`: passed without warnings.
- `git diff --check`: passed.
- Nine focused smoke suites passed: adminAssignment, myAssignedTickets, unassignedTickets, formValidation, pagination, auditLogs, profile, employeeLayout, theme.
- `tests/keyboard.browser.html` and `tests/keyboard.cdp.mjs` run real Edge keyboard events via CDP, without adding a dependency.
- Trusted Tab, Shift+Tab, Enter, Space, Escape and arrow-key checks passed for the shared skip link, theme, form order/invalid focus, disabled Clear filters, combobox selection/reopening, multiline input, file-input reachability, dialog initial focus/trap/pending/restore, details, pagination, row-removal recovery and route focus.
- Shared interaction checks passed at 375/768/1440 px in Light and Dark. Actual Employee/Technician/Admin shell checks passed at those widths for sidebar tab order, hidden-link skipping, menu Escape, route focus and single Logout activation (mock logout callback).
- Verification uses real frontend components with controlled data, not authenticated backend actions. Native file-input reachability was verified; the operating-system file picker was not automated. Not every live data-dependent mutation was executed.

To rerun the browser suite, start Vite on 127.0.0.1:5173 and an isolated headless Edge/Chrome instance with remote debugging on port 9223, then run `node tests/keyboard.cdp.mjs` from client/. `KEYBOARD_CDP_PORT` overrides the debugging port.

## Files changed

Added:
- src/components/focusManagement.js
- src/components/NavigationFocus.jsx
- src/layouts/SkipLink.jsx
- tests/keyboard.browser.html
- tests/keyboard.cdp.mjs
- KEYBOARD_ACCESSIBILITY.md

Updated:
- src/App.jsx
- src/components/ConfirmDialog.jsx
- src/index.css
- src/layouts/EmployeeLayout.jsx
- src/layouts/TechnicianLayout.jsx
- src/layouts/AdminLayout.jsx
- src/pages/admin/AdminTicketAssignment.jsx
- src/pages/admin/AdminAuditLogsPage.jsx
- src/pages/admin/AdminAnalyticsPage.jsx

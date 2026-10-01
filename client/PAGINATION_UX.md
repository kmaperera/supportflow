# Phase 17.10 — Pagination UX

Added `src/components/Pagination.jsx` and `paginationModel.js`. The component
normalizes the existing API metadata shapes:

- Ticket/user/technician/KB: currentPage, totalPages, totalRecords, limit.
- Notifications/audit: page, totalPages, total, limit.
- Ticket reports: page, totalPages, totalItems, limit.

It shows a clamped record range, Previous/Next and compact desktop page buttons.
At most seven page/ellipsis items render; ellipses are not interactive. Mobile
shows Page N of M with wrapping Previous/Next controls. Zero totals and unknown
or invalid metadata render no footer. One-page results show only the range.
Buttons use real disabled states, visible focus and aria-current/page labels.
The handler also prevents duplicate requests before React updates the view.

## Migrated pages

- `src/pages/employee/MyTicketsPage.jsx`, `KnowledgeBasePage.jsx`.
- `src/pages/technician/MyAssignedTicketsPage.jsx`, `UnassignedTicketsPage.jsx`.
- `src/pages/shared/NotificationsPage.jsx` (all roles).
- `src/pages/admin/UserManagementPage.jsx`, `TechnicianManagementPage.jsx`,
  `AdminTicketsPage.jsx`, `AdminKnowledgeBasePage.jsx`, `AdminReportsPage.jsx`,
  `AdminAuditLogsPage.jsx`.

All footers sit below results, outside scrolling tables. Page changes spread
the existing query state so filters and sorting persist. Existing filter/sort
resets to page 1 remain unchanged. No page-size controls were previously
exposed, so fixed endpoint limits remain intact.

Missing last-page recovery was added for employee tickets/KB, assigned tickets,
notifications, audit logs, admin KB and ticket reports. Existing admin list and
self-assignment queue recovery is preserved. Recovery refetches the last valid
page (page 1 for empty totals), preserves criteria and observes cancellation.
Ticket report recovery only moves downward when server totals shrink.

Initial skeletons remain. Most existing list fetchers replace the result area
with their local loading state during a page change, with filters/header still
visible; they do not present active stale pagination. Reports and admin KB
retain their existing previous data and disable controls during refetch. Failed
requests retain ErrorState/Retry and selected criteria. Existing report/KB data
retention is preserved; other list fetchers still use their existing error
panel rather than retaining prior-page data. No fetching framework was changed.

Category and complete workload datasets remain unpaginated. Report export still
uses the full report criteria, not just the displayed page. Routing, auth,
mutations, socket behavior, validations, toasts and confirmations are unchanged.
No search/filter redesign or backend changes were made.

## Verification

Added `tests/pagination.smoke.mjs` and `tests/pagination.browser.html`. Build and
lint passed; Vite retains the existing large-chunk warning. Thirteen smoke suites
passed: pagination, myTickets, myAssignedTickets, unassignedTickets, users,
adminTickets, adminKnowledgeBase, knowledgeBase, notifications, reports,
reportExports, auditLogs, emptyStates.

Headless Chrome passed boundaries, duplicate/pending guards, record ranges,
320px-wide footer layout and current-page semantics. Serve Vite and visit
`/tests/pagination.browser.html` to repeat it. Tests cover mocked contracts and
UI behavior; no live backend mutations were performed.

This document and the component/helper/tests above complete the changed-file list.

# Phase 17.4 skeleton loaders

## Shared presentation

`ContentSkeleton` selects a small initial-loading shape and falls back to the
existing `LoadingState` when `initial` is false. It composes `Skeleton`,
`SkeletonCard`, `SummarySkeleton`, and `SkeletonTable` without dependencies.
Shapes reuse `layout-panel`, responsive grids, and `layout-table` containment.
No placeholder names, numeric counts, chart data, buttons, or form fields appear.

The parent provides a specific polite loading announcement. Decorative shapes
are hidden from assistive technology and use reduced-motion-aware neutral pulses.
Auth startup, profile, form lookups, and mutation loading retain Phase 17.3 UI.

## Coverage

- Employee/Technician dashboards: summary grid and content cards. Admin dashboard:
  independent summary/recent/secondary section placeholders, including its five-card grid.
- All role ticket lists: card skeletons matching the existing card presentation.
  Ticket details: header/metadata, description and secondary-section shapes.
- Users, technicians, categories and SLA policies: cards matching the current UI;
  these pages do not use tables, so no artificial table layout was introduced.
- Shared notifications: common card placeholders across all three roles.
- Employee KB and Admin KB articles/categories: list/card skeletons. Category-filter
  lookup feedback remains compact; loaded editors are unchanged.
- Comments, internal notes and attachments: compact independent placeholders.
- Technician workload: section rows; Admin workload: summary cards and rows/cards.
- Analytics: summary grid, neutral chart-sized rectangles and local section rows.
- Audit logs: matching Time/Actor/Action/Target/Details headers and skeleton rows.
- Reports: matching report-type headers and rows plus summary shapes only during
  generation with no existing results. Idle reports and exports have no skeletons.

## Initial versus later requests

Callers use existing result/data/attempt state to select skeletons only before
initial data. Subsequent filters, paging, retries and updates retain loading text.
Analytics/workload pass a presentation-only initial-view flag across their existing
keyed section remounts so manual refreshes do not restart skeletons. Existing
retained report/KB results remain visible. Other pages retain their existing
result-replacement behavior; this change introduces no caching/fetching system.
No request delay, API change, query-key change, mutation, route, auth, socket,
empty/error-state, toast or dialog changes were introduced.

## Validation

- Build and lint passed; the existing large-bundle warning remains.
- New skeleton smoke test passed: initial/background variants, semantic table
  markup, decorative/reduced-motion classes, absence of controls, and report
  idle/pending behavior.
- 13 existing smoke tests passed: employeeLayout, employeeDashboard,
  technicianDashboard, adminDashboard, ticketDetails, technicianTicketDetails,
  ticketAttachments, ticketConversation, internalNotes, notifications, reports,
  auditLogs, adminKnowledgeBase.
- Diff whitespace checks passed. No manual browser/live-backend testing was done.

## Files changed
- client/SKELETON_LOADERS.md
- client/src/components/ContentSkeleton.jsx
- client/src/pages/admin/AdminAnalyticsPage.jsx
- client/src/pages/admin/AdminAuditLogsPage.jsx
- client/src/pages/admin/AdminDashboardPage.jsx
- client/src/pages/admin/AdminKnowledgeBasePage.jsx
- client/src/pages/admin/AdminReportsPage.jsx
- client/src/pages/admin/AdminTechnicianWorkloadPage.jsx
- client/src/pages/admin/AdminTicketDetailsPage.jsx
- client/src/pages/admin/AdminTicketsPage.jsx
- client/src/pages/admin/CategoryManagementPage.jsx
- client/src/pages/admin/ReportSkeleton.jsx
- client/src/pages/admin/SlaSettingsPage.jsx
- client/src/pages/admin/TechnicianManagementPage.jsx
- client/src/pages/admin/UserManagementPage.jsx
- client/src/pages/employee/EmployeeDashboardPage.jsx
- client/src/pages/employee/KnowledgeBasePage.jsx
- client/src/pages/employee/MyTicketsPage.jsx
- client/src/pages/employee/TicketAttachments.jsx
- client/src/pages/employee/TicketConversation.jsx
- client/src/pages/employee/TicketDetailsPage.jsx
- client/src/pages/shared/NotificationsPage.jsx
- client/src/pages/technician/MyAssignedTicketsPage.jsx
- client/src/pages/technician/TechnicianDashboardPage.jsx
- client/src/pages/technician/TechnicianTicketDetailsPage.jsx
- client/src/pages/technician/TechnicianWorkloadPage.jsx
- client/src/pages/technician/TicketInternalNotes.jsx
- client/src/pages/technician/UnassignedTicketsPage.jsx
- client/tests/skeletons.smoke.mjs

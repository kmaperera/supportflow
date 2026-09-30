# Phase 17.2 layout conventions

This is a structural layer, not a button/theme/state design system. API calls,
handlers, state, route guards, IDs, labels, confirmations, and pagination remain
in their existing components.

## Shared components

- `PageContainer`: one main landmark per role shell; responsive padding lives
  here rather than being repeated inside every page. Data pages use available width.
- `WorkspaceHeader`: common role top bar, page title, user name and role text.
- `PageHeader`: consistent h1/description and optional existing action elements;
  actions wrap and stack on mobile. `titleId` preserves existing heading references.
- `SummaryCard`: dl-compatible label/value display, including the existing
  highlighted unassigned count. Used by all three dashboards and Admin analytics.
- `MetadataList`: shared labels/values for all three ticket-detail implementations;
  the Technician information column retains its workspace-specific grid breakpoint.

## Structural utilities in src/index.css

- `layout-page`: full-width, shrinkable page with consistent section spacing.
- `layout-narrow`: centered 48rem form/readable-content width. Account-security
  forms and profile retain their smaller existing widths for short fields.
- `layout-panel`: common responsive padding, border, background and radius;
  retain the original section/form/article tag and any ARIA attributes.
- `layout-actions`: wrapping action row; button appearance/behavior stays local.
- `layout-table`: constrained scrolling without page-wide overflow; preserve
  captions, cell spacing, existing height limits, and pagination outside the table.

Existing form/filter grid breakpoints remain local. No universal grid component
was needed: dashboards, wide queues and narrow forms have different content needs.

## Migration coverage

All role shells; role dashboards; employee/technician/admin ticket lists and detail
sections; assignment/status/priority/resolve panels; shared attachments, conversation,
history and notification presentation; Employee KB and Admin KB; Admin users,
technicians, workload, categories, SLA, analytics, reports/exports and audit logs.
Most changes are wrapper-class substitutions. Loading/error/empty text and logic
are unchanged. No routing/auth/API/backend/socket code was modified.

## Verification

- Production build and lint pass (existing large-bundle warning remains).
- Existing smoke suite: 50 of 52 pass. `createTicket.smoke.mjs` still expects the
  old "Category options unavailable" placeholder; `technicianLayout.smoke.mjs`
  still expects a Phase 15.16 placeholder instead of the implemented notifications
  page. Both failures were reproduced against unchanged HEAD source. Tests were
  not modified to hide these unrelated failures.
- Chrome: 21 fixture checks across Employee, Technician and Admin shells at
  320, 375, 430, 768, 1024, 1280 and 1440px, with a 600px viewport height.
  Long content, headers/actions, summary cards, metadata, narrow forms and a wide
  table remained contained. Checked one main landmark and generated panel padding.
- These are representative layout checks, not a live-backend end-to-end workflow
  test. Temporary fixture/browser files were removed.

## Files changed

- client/LAYOUT_SYSTEM.md
- client/src/index.css
- client/src/layouts/AdminLayout.jsx
- client/src/layouts/EmployeeLayout.jsx
- client/src/layouts/MetadataList.jsx
- client/src/layouts/PageContainer.jsx
- client/src/layouts/PageHeader.jsx
- client/src/layouts/SummaryCard.jsx
- client/src/layouts/TechnicianLayout.jsx
- client/src/layouts/WorkspaceHeader.jsx
- client/src/pages/admin/AdminAnalyticsPage.jsx
- client/src/pages/admin/AdminAuditLogsPage.jsx
- client/src/pages/admin/AdminDashboardPage.jsx
- client/src/pages/admin/AdminKnowledgeBasePage.jsx
- client/src/pages/admin/AdminPlaceholderPage.jsx
- client/src/pages/admin/AdminReportsPage.jsx
- client/src/pages/admin/AdminTechnicianWorkloadPage.jsx
- client/src/pages/admin/AdminTicketAssignment.jsx
- client/src/pages/admin/AdminTicketDetailsPage.jsx
- client/src/pages/admin/AdminTicketMetadata.jsx
- client/src/pages/admin/AdminTicketsPage.jsx
- client/src/pages/admin/CategoryFormPage.jsx
- client/src/pages/admin/CategoryManagementPage.jsx
- client/src/pages/admin/CreateUserPage.jsx
- client/src/pages/admin/KbArticleFormPage.jsx
- client/src/pages/admin/KbCategoryEditor.jsx
- client/src/pages/admin/kbPresentation.js
- client/src/pages/admin/ReportExportActions.jsx
- client/src/pages/admin/ReportResults.jsx
- client/src/pages/admin/SlaSettingsPage.jsx
- client/src/pages/admin/TechnicianManagementPage.jsx
- client/src/pages/admin/UserManagementPage.jsx
- client/src/pages/employee/CreateTicketPage.jsx
- client/src/pages/employee/EditTicketForm.jsx
- client/src/pages/employee/EmployeeDashboardPage.jsx
- client/src/pages/employee/KnowledgeBaseArticlePage.jsx
- client/src/pages/employee/KnowledgeBasePage.jsx
- client/src/pages/employee/MyTicketsPage.jsx
- client/src/pages/employee/TicketAttachments.jsx
- client/src/pages/employee/TicketConversation.jsx
- client/src/pages/employee/TicketDetailsPage.jsx
- client/src/pages/employee/TicketFilters.jsx
- client/src/pages/employee/TicketRating.jsx
- client/src/pages/employee/TicketStatusTimeline.jsx
- client/src/pages/shared/NotificationsPage.jsx
- client/src/pages/technician/MyAssignedTicketsPage.jsx
- client/src/pages/technician/QueueFilters.jsx
- client/src/pages/technician/TechnicianDashboardPage.jsx
- client/src/pages/technician/TechnicianPlaceholderPage.jsx
- client/src/pages/technician/TechnicianTicketDetailsPage.jsx
- client/src/pages/technician/TechnicianWorkloadPage.jsx
- client/src/pages/technician/TicketPriorityControl.jsx
- client/src/pages/technician/TicketResolveControl.jsx
- client/src/pages/technician/TicketSlaTimers.jsx
- client/src/pages/technician/TicketStatusActions.jsx
- client/src/pages/technician/UnassignedTicketsPage.jsx

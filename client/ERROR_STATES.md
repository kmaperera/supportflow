# Phase 17.6 — Error states

Query failures use `components/ErrorState.jsx`, with contextual headings, an alert,
wrapping text and the existing layout-panel/action styles. Compact panels are used
inside ticket sections and filter lookups. Retry buttons retain the existing
request/attempt handlers: starting a retry replaces the failed result with the
existing loading state. The async admin detail-refresh retry has a synchronous
duplicate-click guard, disabled button and Retrying text.

`api/apiError.js` retains its public-message allowlist and safe network/auth
fallbacks. `getResourceError` distinguishes missing ticket/article (404), denied
access (403), invalid resource (400/422), expired authentication (401), and
retryable server/network failures. The known stale-assignment conflict message
is allowed; arbitrary backend messages are not. Authentication/refresh behavior
is unchanged. `auth/AuthFeedback.jsx` keeps mutation feedback inline and adds
safe wrapping for narrow screens.

Employee and technician ticket/article details use the resource helper. Lists,
dashboards, notifications, workload, admin management, KB, SLA, analytics,
reports and audit queries use shared error panels. Secondary failures remain
local. Existing report results remain visible after generation failure. CSV/PDF
blob parsing and download validation are unchanged. Notification read failure
still permits ticket navigation without falsely marking a record read.

Form values, drafts, filters, page state, safe mutation messages and conflict
refetches are preserved. Loading, successful empty results and failures remain
separate. No backend, route, API contract, toast, dialog or empty-state redesign.

## Files changed

- Shared: `src/components/ErrorState.jsx`, `src/api/apiError.js`,
  `src/auth/AuthFeedback.jsx`, `src/pages/shared/NotificationsPage.jsx`.
- Employee pages: `CreateTicketPage`, `EditTicketForm`, `EmployeeDashboardPage`,
  `KnowledgeBaseArticlePage`, `KnowledgeBasePage`, `MyTicketsPage`,
  `TicketAttachments`, `TicketConversation`, `TicketDetailsPage`, `TicketFilters`,
  `TicketStatusTimeline` (all `.jsx` under `src/pages/employee/`).
- Technician pages: `MyAssignedTicketsPage`, `TechnicianDashboardPage`,
  `TechnicianTicketDetailsPage`, `TechnicianWorkloadPage`, `TicketInternalNotes`,
  `TicketPriorityControl`, `UnassignedTicketsPage` (all `.jsx` under
  `src/pages/technician/`).
- Admin pages: `AdminAnalyticsPage`, `AdminAuditLogsPage`, `AdminDashboardPage`,
  `AdminKnowledgeBasePage`, `AdminReportsPage`, `AdminTechnicianWorkloadPage`,
  `AdminTicketAssignment`, `AdminTicketDetailsPage`, `AdminTicketsPage`,
  `CategoryFormPage`, `CategoryManagementPage`, `KbArticleFormPage`,
  `SlaSettingsPage`, `TechnicianManagementPage`, `UserManagementPage`
  (all `.jsx` under `src/pages/admin/`).
- Verification: `tests/errorStates.smoke.mjs`; this document.

## Verification

Build and lint pass. Vite retains its existing warning about a main chunk over
500 kB. Twenty focused smoke suites pass: errorStates, emptyStates, skeletons,
ticketDetails, technicianTicketDetails, adminAssignment, reports, reportExports,
notifications, auditLogs, adminAnalytics, adminDashboard, employeeDashboard,
technicianDashboard, adminKnowledgeBase, myTickets, unassignedTickets,
ticketConversation, internalNotes, ticketStatusTimeline.

Tests cover safe message handling, HTTP status distinctions, escaped rendering,
alert/retry semantics and existing contracts/presentations. Live browser/network
failure scenarios were not exercised against a running backend.

# Phase 17.5 empty states

`src/components/EmptyState.jsx` provides a compact title, optional helper text and
existing action elements. It reuses the Phase 17.2 panel/action layout, with a
smaller inline variant inside existing sections. There are no illustrations,
dependencies, new routes, or automatic actions.

## Coverage

- Employee: dashboard first-ticket guidance, My Tickets, KB search/results and
  shared notifications. Existing Create Ticket links remain available.
- Technician: dashboard, assigned/unassigned lists and workload statistics.
  Queue/list next actions and filtered reset actions remain available.
- Admin: users, technicians, ticket categories, all tickets, assignment selector,
  workload, SLA policies, KB articles/categories, dashboards, analytics, reports
  and audit logs.
- Shared ticket content: empty conversation, internal notes, attachments and
  status history. Their permitted composers/upload controls are unchanged.

## Distinctions and actions

Empty states remain within existing successful-response branches. Loading,
skeletons and errors retain their separate paths. Filtered states use the current
applied-query/filter conditions rather than claiming the whole system is empty.
Ticket lists also retain their separate empty-current-page message.

Existing reset handlers are reused for search/filters. Useful Admin empty states
link to existing Create User, Add Category, Manage User Accounts and Add Article
routes; existing role guards continue to control access. No create-policy action
or unsupported role action was added.

Reports distinguish the idle "choose criteria and generate" state from successful
zero-row results; neither is shown in place of an error/loading state. Analytics
uses contextual empty messages for absent ticket data, SLA samples and ratings.
Legitimate zero counts/durations and dashboard summary cards remain data.

## Verification

- Build, lint and diff whitespace checks passed; existing bundle-size warning remains.
- New empty-state regression test passed for true/filtered/current-page empty
  states, useful links, report idle/empty distinction and initial loading separation.
- 13 existing smoke tests passed: employeeDashboard, technicianDashboard,
  adminDashboard, myTickets, myAssignedTickets, unassignedTickets,
  ticketConversation, internalNotes, ticketStatusTimeline, notifications,
  reports, adminKnowledgeBase and skeletons.
- No manual browser or live-backend testing was performed.

No API, auth, socket, pagination, mutation, routing, export, error-state,
toast or dialog behavior was changed.

## Files changed
- client/EMPTY_STATES.md
- client/src/components/EmptyState.jsx
- client/src/pages/admin/AdminAnalyticsPage.jsx
- client/src/pages/admin/AdminAuditLogsPage.jsx
- client/src/pages/admin/AdminDashboardPage.jsx
- client/src/pages/admin/AdminKnowledgeBasePage.jsx
- client/src/pages/admin/AdminReportsPage.jsx
- client/src/pages/admin/AdminTechnicianWorkloadPage.jsx
- client/src/pages/admin/AdminTicketAssignment.jsx
- client/src/pages/admin/AdminTicketsPage.jsx
- client/src/pages/admin/CategoryManagementPage.jsx
- client/src/pages/admin/ReportResults.jsx
- client/src/pages/admin/SlaSettingsPage.jsx
- client/src/pages/admin/TechnicianManagementPage.jsx
- client/src/pages/admin/UserManagementPage.jsx
- client/src/pages/employee/EmployeeDashboardPage.jsx
- client/src/pages/employee/KnowledgeBasePage.jsx
- client/src/pages/employee/MyTicketsPage.jsx
- client/src/pages/employee/TicketAttachments.jsx
- client/src/pages/employee/TicketConversation.jsx
- client/src/pages/employee/TicketStatusTimeline.jsx
- client/src/pages/shared/NotificationsPage.jsx
- client/src/pages/technician/MyAssignedTicketsPage.jsx
- client/src/pages/technician/TechnicianDashboardPage.jsx
- client/src/pages/technician/TechnicianWorkloadPage.jsx
- client/src/pages/technician/TicketInternalNotes.jsx
- client/src/pages/technician/UnassignedTicketsPage.jsx
- client/tests/emptyStates.smoke.mjs

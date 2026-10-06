# Phase 17.12 — Status/Priority Badges

Presentation-only changes inside client/. No backend, API payload, enum, workflow, role, mutation, filter, pagination, SLA calculation, export, or dark-mode changes.

## Shared components

`src/components/Badges.jsx` provides StatusBadge, PriorityBadge, StateBadge and a boolean-safe ActiveBadge. One internal primitive owns the compact rounded shape, spacing, type size, wrapping and tone classes. Mappings are centralized for future theme variants; no dark mode is implemented.

| Ticket value | Label | Tone |
| --- | --- | --- |
| OPEN | Open | Blue |
| ASSIGNED | Assigned | Indigo |
| IN_PROGRESS | In Progress | Amber |
| WAITING_FOR_USER | Waiting for User | Orange |
| RESOLVED | Resolved | Green |
| CLOSED | Closed | Gray |
| REOPENED | Reopened | Purple |

| Priority | Tone |
| --- | --- |
| Low | Gray |
| Medium | Blue |
| High | Orange |
| Critical | Red, with a stronger background |

Active and Published use green; Inactive, Archived and Read use neutral gray; Unpublished uses amber; Unread uses blue. The existing KB DRAFT value displays as Unpublished without changing the stored value or publish/unpublish actions.

SLA badges map the existing on-track, warning, breached, met and unavailable states. Existing completed-milestone wording, clocks, deadlines, warning thresholds and severity containers remain intact. No states are inferred for aggregate SLA statistics.

Unknown nonempty strings are humanized and shown in neutral gray. Missing, blank and invalid non-string values show Unknown. Boolean account states distinguish true, false and missing values. Text is always present; color is supplemental. Dark foregrounds on light backgrounds, compact intrinsic width and normal wrapping avoid pale text and full-width badges.

## Migration coverage

- Employee dashboard, My Tickets, ticket detail and status timeline.
- Technician dashboard, shared assigned/unassigned ticket cards, ticket workspace, current status/priority action summaries, workload/statistics and SLA timing labels.
- Admin dashboard, shared ticket metadata (all tickets and detail), report tables, analytics value lists and technician account tables, users, technicians, technician workload, ticket categories, KB article/category states and SLA settings.
- Shared notifications and profile account state.
- Chart labels and native select options remain text. Audit logs contain action/entity references rather than ticket status/priority fields, so no synthetic ticket badges were added there. Role chips, aggregate metric headings and narrative/action wording remain unchanged.
- Reports retain their table overflow container; badge cells are vertically centered. Lists and details use the same compact badge size.

## Verification

- npm run build: passed; warning remains for a bundle larger than 500 kB.
- npm run lint: passed without warnings.
- git diff --check: passed.
- 19 existing smoke scripts passed: employeeDashboard, myTickets, ticketDetails, ticketStatusTimeline, technicianDashboard, myAssignedTickets, unassignedTickets, technicianTicketDetails, technicianWorkload, technicianStatusActions, technicianPriority, technicianSlaTimers, slaDisplayState, adminDashboard, adminTickets, adminAnalytics, reports, adminKnowledgeBase, notifications.
- Headless Edge fixture (`tests/badges.browser.html`) passed readable labels, fallback values, compact sizing, distinct priority tones and no-overflow wrapping at container widths 320, 375 and 1280 px, including a long unknown value.
- Browser verification covers the shared badges, not an authenticated end-to-end backend session.

## Changed files

Added:
- src/components/Badges.jsx
- tests/badges.browser.html
- STATUS_PRIORITY_BADGES.md

Updated:
- src/pages/admin/AdminAnalyticsPage.jsx
- src/pages/admin/AdminDashboardPage.jsx
- src/pages/admin/AdminKnowledgeBasePage.jsx
- src/pages/admin/AdminTechnicianWorkloadPage.jsx
- src/pages/admin/AdminTicketMetadata.jsx
- src/pages/admin/CategoryManagementPage.jsx
- src/pages/admin/ReportResults.jsx
- src/pages/admin/SlaSettingsPage.jsx
- src/pages/admin/TechnicianManagementPage.jsx
- src/pages/admin/UserManagementPage.jsx
- src/pages/auth/ProfilePage.jsx
- src/pages/employee/EmployeeDashboardPage.jsx
- src/pages/employee/MyTicketsPage.jsx
- src/pages/employee/TicketDetailsPage.jsx
- src/pages/employee/TicketStatusTimeline.jsx
- src/pages/shared/NotificationsPage.jsx
- src/pages/technician/TechnicianDashboardPage.jsx
- src/pages/technician/TechnicianTicketCards.jsx
- src/pages/technician/TechnicianTicketDetailsPage.jsx
- src/pages/technician/TechnicianWorkloadPage.jsx
- src/pages/technician/TicketPriorityControl.jsx
- src/pages/technician/TicketSlaTimers.jsx
- src/pages/technician/TicketStatusActions.jsx

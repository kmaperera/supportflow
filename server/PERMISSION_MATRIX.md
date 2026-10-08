# Phase 18.12 ? API permission matrix

Reviewed all 99 /api/v1 method/path pairs before production changes. Authentication uses current DB identity/role, not request fields or stale JWT role. Normal protected routes: 401 without authentication, 403 for forbidden role, 404 for inaccessible resource. Lifecycle/concurrency conflicts remain 409; validation remains 400/422. Refresh/logout endpoints use their documented cookie rules.

| Method | Path | Authentication / roles | Ownership / resource rule | Denied status |
|---|---|---|---|---|
| GET | /api/v1/health | public | Intentionally public health endpoint | Public |
| POST | /api/v1/auth/login | cookie/public | Login credentials or validated refresh cookie; logout is idempotent | 401 for invalid required credentials/cookie; logout idempotent |
| POST | /api/v1/auth/refresh | cookie/public | Login credentials or validated refresh cookie; logout is idempotent | 401 for invalid required credentials/cookie; logout idempotent |
| POST | /api/v1/auth/logout | cookie/public | Login credentials or validated refresh cookie; logout is idempotent | 401 for invalid required credentials/cookie; logout idempotent |
| POST | /api/v1/auth/logout-all | cookie/public | Login credentials or validated refresh cookie; logout is idempotent | 401 for invalid required credentials/cookie; logout idempotent |
| GET | /api/v1/auth/me | authenticated | Current authenticated user only; no client-selected identity | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/auth/change-password | authenticated | Current authenticated user only; no client-selected identity | 401 / 403; scoped objects 404 |
| GET | /api/v1/users | ADMIN | Admin management; no self-deactivation or self-role change; profile fields allowlisted | 401 / 403; scoped objects 404 |
| POST | /api/v1/users | ADMIN | Admin management; no self-deactivation or self-role change; profile fields allowlisted | 401 / 403; scoped objects 404 |
| GET | /api/v1/users/assignable-technicians | ADMIN | Admin management; no self-deactivation or self-role change; profile fields allowlisted | 401 / 403; scoped objects 404 |
| GET | /api/v1/users/technician-workload | ADMIN | Admin management; no self-deactivation or self-role change; profile fields allowlisted | 401 / 403; scoped objects 404 |
| GET | /api/v1/users/:id | ADMIN | Admin management; no self-deactivation or self-role change; profile fields allowlisted | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/users/:id | ADMIN | Admin management; no self-deactivation or self-role change; profile fields allowlisted | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/users/:id/status | ADMIN | Admin management; no self-deactivation or self-role change; profile fields allowlisted | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/users/:id/role | ADMIN | Admin management; no self-deactivation or self-role change; profile fields allowlisted | 401 / 403; scoped objects 404 |
| GET | /api/v1/tickets/admin/categories | ADMIN | Admin-only category management | 401 / 403; scoped objects 404 |
| GET | /api/v1/tickets/admin/categories/:categoryId | ADMIN | Admin-only category management | 401 / 403; scoped objects 404 |
| POST | /api/v1/tickets/admin/categories | ADMIN | Admin-only category management | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/tickets/admin/categories/:categoryId | ADMIN | Admin-only category management | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/tickets/admin/categories/:categoryId/status | ADMIN | Admin-only category management | 401 / 403; scoped objects 404 |
| GET | /api/v1/tickets/categories | EMPLOYEE/TECHNICIAN/ADMIN | Authenticated active lookup only | 401 / 403; scoped objects 404 |
| GET | /api/v1/tickets/priorities | EMPLOYEE/TECHNICIAN/ADMIN | Authenticated active lookup only | 401 / 403; scoped objects 404 |
| DELETE | /api/v1/tickets/:id/attachments/:attachmentId | authenticated | Parent ticket access + child belongs to ticket + internal visibility; uploads need owner/assigned Technician/Admin; deletion also uploader or Admin | 401 / 403; scoped objects 404 |
| POST | /api/v1/tickets/:id/attachments | authenticated | Parent ticket access + child belongs to ticket + internal visibility; uploads need owner/assigned Technician/Admin; deletion also uploader or Admin | 401 / 403; scoped objects 404 |
| POST | /api/v1/tickets/:id/comments/:commentId/attachments | authenticated | Parent ticket access + child belongs to ticket + internal visibility; uploads need owner/assigned Technician/Admin; deletion also uploader or Admin | 401 / 403; scoped objects 404 |
| GET | /api/v1/tickets/:id/attachments | authenticated | Parent ticket access + child belongs to ticket + internal visibility; uploads need owner/assigned Technician/Admin; deletion also uploader or Admin | 401 / 403; scoped objects 404 |
| GET | /api/v1/tickets/:id/attachments/:attachmentId/download | authenticated | Parent ticket access + child belongs to ticket + internal visibility; uploads need owner/assigned Technician/Admin; deletion also uploader or Admin | 401 / 403; scoped objects 404 |
| GET | /api/v1/tickets/my | EMPLOYEE | Employee creator identity scopes list AND count | 401 / 403; scoped objects 404 |
| POST | /api/v1/tickets | EMPLOYEE | Creator derived from authenticated Employee | 401 / 403; scoped objects 404 |
| GET | /api/v1/tickets/queue | TECHNICIAN/ADMIN | Technician: unassigned or own; Admin: all; filters cannot broaden scope | 401 / 403; scoped objects 404 |
| GET | /api/v1/tickets/assigned-to-me | TECHNICIAN | Technician session identity scopes list AND count | 401 / 403; scoped objects 404 |
| GET | /api/v1/tickets/workflow-summary | ADMIN | Admin-only; stale current-assignment token on unassign; existing lifecycle rules | 401 / 403; scoped objects 404 |
| GET | /api/v1/tickets/:id | authenticated | Employee owner; Technician unassigned/own; Admin all; employee comments omit internal notes | 401 / 403; scoped objects 404 |
| GET | /api/v1/tickets/:id/comments | authenticated | Employee owner; Technician unassigned/own; Admin all; employee comments omit internal notes | 401 / 403; scoped objects 404 |
| POST | /api/v1/tickets/:id/comments | authenticated | Employee owner, assigned Technician or Admin; public content only | 401 / 403; scoped objects 404 |
| POST | /api/v1/tickets/:id/internal-notes | TECHNICIAN/ADMIN | Assigned Technician or Admin; never Employee | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/tickets/:id | EMPLOYEE | Employee owner only; editable fields and status allowlisted | 401 / 403; scoped objects 404 |
| POST | /api/v1/tickets/:id/self-assign | TECHNICIAN | Technician from session; unassigned OPEN ticket only | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/tickets/:id/assign | ADMIN | Admin-only; stale current-assignment token on unassign; existing lifecycle rules | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/tickets/:id/unassign | ADMIN | Admin-only; stale current-assignment token on unassign; existing lifecycle rules | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/tickets/:id/status | TECHNICIAN/ADMIN | Assigned Technician or Admin; valid lifecycle separately enforced | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/tickets/:id/priority | TECHNICIAN/ADMIN | Assigned Technician or Admin; valid lifecycle separately enforced | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/tickets/:id/resolve | TECHNICIAN/ADMIN | Assigned Technician or Admin; valid lifecycle separately enforced | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/tickets/:id/close | EMPLOYEE/ADMIN | Employee owner or Admin; valid lifecycle separately enforced | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/tickets/:id/reopen | EMPLOYEE/ADMIN | Employee owner or Admin; valid lifecycle separately enforced | 401 / 403; scoped objects 404 |
| GET | /api/v1/tickets/:id/status-history | authenticated | Employee owner; Technician unassigned/own; Admin all; employee comments omit internal notes | 401 / 403; scoped objects 404 |
| GET | /api/v1/tickets/:id/assignment-history | authenticated | Employee owner; Technician unassigned/own; Admin all; employee comments omit internal notes | 401 / 403; scoped objects 404 |
| PUT | /api/v1/tickets/:ticketId/feedback | EMPLOYEE | Employee owner only, CLOSED ticket | 401 / 403; scoped objects 404 |
| GET | /api/v1/notifications | authenticated | Current user only for rows and counts; NO Admin bypass | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/notifications/read-all | authenticated | Current user only for rows and counts; NO Admin bypass | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/notifications/:notificationId/read | authenticated | Current user only for rows and counts; NO Admin bypass | 401 / 403; scoped objects 404 |
| GET | /api/v1/sla/policies | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/sla/policies/:policyId | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |
| POST | /api/v1/knowledge-base/articles/suggestions | EMPLOYEE/TECHNICIAN/ADMIN | Readers: published and active-category content; Admin: management visibility; suggestions published only | 401 / 403; scoped objects 404 |
| GET | /api/v1/knowledge-base/categories | ADMIN | Readers: published and active-category content; Admin: management visibility; suggestions published only | 401 / 403; scoped objects 404 |
| POST | /api/v1/knowledge-base/categories | ADMIN | Admin-only category/article management | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/knowledge-base/categories/:categoryId | ADMIN | Admin-only category/article management | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/knowledge-base/categories/:categoryId/status | ADMIN | Admin-only category/article management | 401 / 403; scoped objects 404 |
| POST | /api/v1/knowledge-base/articles | ADMIN | Admin-only category/article management | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/knowledge-base/articles/:articleId | ADMIN | Admin-only category/article management | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/knowledge-base/articles/:articleId/publish | ADMIN | Admin-only category/article management | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/knowledge-base/articles/:articleId/unpublish | ADMIN | Admin-only category/article management | 401 / 403; scoped objects 404 |
| PATCH | /api/v1/knowledge-base/articles/:articleId/archive | ADMIN | Admin-only category/article management | 401 / 403; scoped objects 404 |
| GET | /api/v1/knowledge-base/articles | authenticated | Readers: published and active-category content; Admin: management visibility; suggestions published only | 401 / 403; scoped objects 404 |
| GET | /api/v1/knowledge-base/articles/:articleId | authenticated | Readers: published and active-category content; Admin: management visibility; suggestions published only | 401 / 403; scoped objects 404 |
| PUT | /api/v1/knowledge-base/articles/:articleId/feedback | authenticated | Employee/Technician own feedback on readable published article; Admin write forbidden | 401 / 403; scoped objects 404 |
| GET | /api/v1/knowledge-base/articles/:articleId/feedback | authenticated | Readers: published and active-category content; Admin: management visibility; suggestions published only | 401 / 403; scoped objects 404 |
| GET | /api/v1/dashboard/employee/summary | EMPLOYEE | Employee creator scope; Technician assigned scope plus intended unassigned queue count; Admin global | 401 / 403; scoped objects 404 |
| GET | /api/v1/dashboard/technician/summary | TECHNICIAN | Employee creator scope; Technician assigned scope plus intended unassigned queue count; Admin global | 401 / 403; scoped objects 404 |
| GET | /api/v1/dashboard/admin/summary | ADMIN | Admin global data | 401 / 403; scoped objects 404 |
| GET | /api/v1/dashboard/ticket-summary | authenticated | Employee creator scope; Technician assigned scope plus intended unassigned queue count; Admin global | 401 / 403; scoped objects 404 |
| GET | /api/v1/dashboard/status-distribution | authenticated | Employee creator scope; Technician assigned scope plus intended unassigned queue count; Admin global | 401 / 403; scoped objects 404 |
| GET | /api/v1/dashboard/category-distribution | authenticated | Employee creator scope; Technician assigned scope plus intended unassigned queue count; Admin global | 401 / 403; scoped objects 404 |
| GET | /api/v1/dashboard/priority-distribution | authenticated | Employee creator scope; Technician assigned scope plus intended unassigned queue count; Admin global | 401 / 403; scoped objects 404 |
| GET | /api/v1/dashboard/technician-workload | ADMIN | Admin global data | 401 / 403; scoped objects 404 |
| GET | /api/v1/dashboard/average-first-response-time | EMPLOYEE/TECHNICIAN/ADMIN | Employee creator scope; Technician assigned scope plus intended unassigned queue count; Admin global | 401 / 403; scoped objects 404 |
| GET | /api/v1/dashboard/average-resolution-time | EMPLOYEE/TECHNICIAN/ADMIN | Employee creator scope; Technician assigned scope plus intended unassigned queue count; Admin global | 401 / 403; scoped objects 404 |
| GET | /api/v1/dashboard/sla-compliance | EMPLOYEE/TECHNICIAN/ADMIN | Employee creator scope; Technician assigned scope plus intended unassigned queue count; Admin global | 401 / 403; scoped objects 404 |
| GET | /api/v1/dashboard/ticket-trend | EMPLOYEE/TECHNICIAN/ADMIN | Employee creator scope; Technician assigned scope plus intended unassigned queue count; Admin global | 401 / 403; scoped objects 404 |
| GET | /api/v1/dashboard/recent-tickets | EMPLOYEE/TECHNICIAN/ADMIN | Employee creator scope; Technician assigned scope plus intended unassigned queue count; Admin global | 401 / 403; scoped objects 404 |
| GET | /api/v1/dashboard/recent-activity | EMPLOYEE/TECHNICIAN/ADMIN | Employee creator scope; Technician assigned scope plus intended unassigned queue count; Admin global | 401 / 403; scoped objects 404 |
| GET | /api/v1/dashboard/satisfaction-summary | ADMIN | Admin global data | 401 / 403; scoped objects 404 |
| GET | /api/v1/reports/tickets/export/pdf | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |
| GET | /api/v1/reports/tickets/export/csv | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |
| GET | /api/v1/reports/tickets | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |
| GET | /api/v1/reports/date-range | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |
| GET | /api/v1/reports/technician-performance | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |
| GET | /api/v1/reports/sla | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |
| GET | /api/v1/reports/categories | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |
| GET | /api/v1/reports/priorities | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |
| GET | /api/v1/reports/statuses | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |
| GET | /api/v1/reports/date-range/export/csv | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |
| GET | /api/v1/reports/technician-performance/export/csv | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |
| GET | /api/v1/reports/sla/export/csv | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |
| GET | /api/v1/reports/categories/export/csv | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |
| GET | /api/v1/reports/priorities/export/csv | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |
| GET | /api/v1/reports/statuses/export/csv | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |
| GET | /api/v1/reports/analytics/export/pdf | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |
| GET | /api/v1/audit-logs | ADMIN | Admin-only, including exports and aggregate counts | 401 / 403; scoped objects 404 |

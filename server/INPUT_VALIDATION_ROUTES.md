# Phase 18.1 route inventory

99 mounted method/path pairs reviewed. Request fields, files, limits and service assumptions are detailed by module in [INPUT_VALIDATION_REVIEW.md](INPUT_VALIDATION_REVIEW.md). No-input endpoints consume no client body/query values; irrelevant fields remain ignored unless explicitly rejected. All listed params are positive integer IDs, validated before controller/repository work. Uploads additionally parse the existing attachment file and reject text metadata.

Authentication/authorization precede validation on protected routes. Cookie endpoints retain their existing authentication semantics. Resource existence, ownership, uniqueness and transitions remain service checks.

| Method | Path | Access | Params | Validation boundary |
|---|---|---|---|---|
| GET | /api/v1/health | public | - | No consumed body/query input |
| POST | /api/v1/auth/login | cookie/public | - | loginValidation |
| POST | /api/v1/auth/refresh | cookie/public | - | cookieActionValidation |
| POST | /api/v1/auth/logout | cookie/public | - | cookieActionValidation |
| POST | /api/v1/auth/logout-all | cookie/public | - | cookieActionValidation |
| GET | /api/v1/auth/me | authenticated | - | No consumed body/query input |
| PATCH | /api/v1/auth/change-password | authenticated | - | changePasswordValidation |
| GET | /api/v1/users | ADMIN | - | validation, listUsersValidation |
| POST | /api/v1/users | ADMIN | - | createUserValidation |
| GET | /api/v1/users/assignable-technicians | ADMIN | - | assignableTechniciansValidation |
| GET | /api/v1/users/technician-workload | ADMIN | - | assignableTechniciansValidation |
| GET | /api/v1/users/:id | ADMIN | id | userIdValidation |
| PATCH | /api/v1/users/:id | ADMIN | id | userIdValidation, updateUserValidation |
| PATCH | /api/v1/users/:id/status | ADMIN | id | updateUserStatusValidation |
| PATCH | /api/v1/users/:id/role | ADMIN | id | updateUserRoleValidation |
| GET | /api/v1/tickets/admin/categories | ADMIN | - | No consumed body/query input |
| GET | /api/v1/tickets/admin/categories/:categoryId | ADMIN | categoryId | categoryValidation, categoryIdValidation |
| POST | /api/v1/tickets/admin/categories | ADMIN | - | categoryValidation, createCategoryValidation |
| PATCH | /api/v1/tickets/admin/categories/:categoryId | ADMIN | categoryId | categoryValidation, updateCategoryValidation |
| PATCH | /api/v1/tickets/admin/categories/:categoryId/status | ADMIN | categoryId | categoryValidation, setCategoryActiveStatusValidation |
| GET | /api/v1/tickets/categories | EMPLOYEE/TECHNICIAN/ADMIN | - | No consumed body/query input |
| GET | /api/v1/tickets/priorities | EMPLOYEE/TECHNICIAN/ADMIN | - | No consumed body/query input |
| DELETE | /api/v1/tickets/:id/attachments/:attachmentId | authenticated | id, attachmentId | deleteTicketAttachmentValidation |
| POST | /api/v1/tickets/:id/attachments | authenticated | id | validateSingleAttachment, uploadTicketAttachmentValidation |
| POST | /api/v1/tickets/:id/comments/:commentId/attachments | authenticated | id, commentId | validateSingleAttachment, uploadCommentAttachmentValidation |
| GET | /api/v1/tickets/:id/attachments | authenticated | id | getTicketAttachmentsValidation |
| GET | /api/v1/tickets/:id/attachments/:attachmentId/download | authenticated | id, attachmentId | downloadTicketAttachmentValidation |
| GET | /api/v1/tickets/my | EMPLOYEE | - | getMyTicketsValidation |
| POST | /api/v1/tickets | EMPLOYEE | - | createTicketValidation |
| GET | /api/v1/tickets/queue | TECHNICIAN/ADMIN | - | ticketQueueValidation |
| GET | /api/v1/tickets/assigned-to-me | TECHNICIAN | - | assignedTicketsValidation |
| GET | /api/v1/tickets/workflow-summary | ADMIN | - | No consumed body/query input |
| GET | /api/v1/tickets/:id | authenticated | id | ticketIdValidation |
| GET | /api/v1/tickets/:id/comments | authenticated | id | getTicketCommentsValidation |
| POST | /api/v1/tickets/:id/comments | authenticated | id | createPublicCommentValidation |
| POST | /api/v1/tickets/:id/internal-notes | TECHNICIAN/ADMIN | id | createInternalNoteValidation |
| PATCH | /api/v1/tickets/:id | EMPLOYEE | id | updateEmployeeTicketValidation |
| POST | /api/v1/tickets/:id/self-assign | TECHNICIAN | id | validation, selfAssignValidation |
| PATCH | /api/v1/tickets/:id/assign | ADMIN | id | adminAssignTicketValidation |
| PATCH | /api/v1/tickets/:id/unassign | ADMIN | id | unassignTicketValidation |
| PATCH | /api/v1/tickets/:id/status | TECHNICIAN/ADMIN | id | updateTicketStatusValidation |
| PATCH | /api/v1/tickets/:id/priority | TECHNICIAN/ADMIN | id | updateTicketPriorityValidation |
| PATCH | /api/v1/tickets/:id/resolve | TECHNICIAN/ADMIN | id | resolveTicketValidation |
| PATCH | /api/v1/tickets/:id/close | EMPLOYEE/ADMIN | id | closeTicketValidation |
| PATCH | /api/v1/tickets/:id/reopen | EMPLOYEE/ADMIN | id | reopenTicketValidation |
| GET | /api/v1/tickets/:id/status-history | authenticated | id | ticketIdValidation |
| GET | /api/v1/tickets/:id/assignment-history | authenticated | id | ticketIdValidation |
| PUT | /api/v1/tickets/:ticketId/feedback | EMPLOYEE | ticketId | saveTicketFeedbackValidation |
| GET | /api/v1/notifications | authenticated | - | getNotificationsValidation |
| PATCH | /api/v1/notifications/read-all | authenticated | - | No consumed body/query input |
| PATCH | /api/v1/notifications/:notificationId/read | authenticated | notificationId | markNotificationAsReadValidation |
| GET | /api/v1/sla/policies | ADMIN | - | No consumed body/query input |
| PATCH | /api/v1/sla/policies/:policyId | ADMIN | policyId | updateSlaPolicyValidation |
| POST | /api/v1/knowledge-base/articles/suggestions | EMPLOYEE/TECHNICIAN/ADMIN | - | suggestionsValidation |
| GET | /api/v1/knowledge-base/categories | ADMIN | - | No consumed body/query input |
| POST | /api/v1/knowledge-base/categories | ADMIN | - | createCategoryValidation |
| PATCH | /api/v1/knowledge-base/categories/:categoryId | ADMIN | categoryId | updateCategoryValidation |
| PATCH | /api/v1/knowledge-base/categories/:categoryId/status | ADMIN | categoryId | setCategoryActiveStatusValidation |
| POST | /api/v1/knowledge-base/articles | ADMIN | - | createArticleValidation |
| PATCH | /api/v1/knowledge-base/articles/:articleId | ADMIN | articleId | updateArticleValidation |
| PATCH | /api/v1/knowledge-base/articles/:articleId/publish | ADMIN | articleId | articleStatusValidation, emptyBody |
| PATCH | /api/v1/knowledge-base/articles/:articleId/unpublish | ADMIN | articleId | articleStatusValidation, emptyBody |
| PATCH | /api/v1/knowledge-base/articles/:articleId/archive | ADMIN | articleId | articleStatusValidation, emptyBody |
| GET | /api/v1/knowledge-base/articles | authenticated | - | listArticlesValidation |
| GET | /api/v1/knowledge-base/articles/:articleId | authenticated | articleId | articleStatusValidation |
| PUT | /api/v1/knowledge-base/articles/:articleId/feedback | authenticated | articleId | articleStatusValidation, setArticleFeedbackValidation |
| GET | /api/v1/knowledge-base/articles/:articleId/feedback | authenticated | articleId | articleStatusValidation |
| GET | /api/v1/dashboard/employee/summary | EMPLOYEE | - | No consumed body/query input |
| GET | /api/v1/dashboard/technician/summary | TECHNICIAN | - | No consumed body/query input |
| GET | /api/v1/dashboard/admin/summary | ADMIN | - | No consumed body/query input |
| GET | /api/v1/dashboard/ticket-summary | authenticated | - | query |
| GET | /api/v1/dashboard/status-distribution | authenticated | - | query |
| GET | /api/v1/dashboard/category-distribution | authenticated | - | query |
| GET | /api/v1/dashboard/priority-distribution | authenticated | - | query |
| GET | /api/v1/dashboard/technician-workload | ADMIN | - | query |
| GET | /api/v1/dashboard/average-first-response-time | EMPLOYEE/TECHNICIAN/ADMIN | - | query |
| GET | /api/v1/dashboard/average-resolution-time | EMPLOYEE/TECHNICIAN/ADMIN | - | query |
| GET | /api/v1/dashboard/sla-compliance | EMPLOYEE/TECHNICIAN/ADMIN | - | query |
| GET | /api/v1/dashboard/ticket-trend | EMPLOYEE/TECHNICIAN/ADMIN | - | query |
| GET | /api/v1/dashboard/recent-tickets | EMPLOYEE/TECHNICIAN/ADMIN | - | query |
| GET | /api/v1/dashboard/recent-activity | EMPLOYEE/TECHNICIAN/ADMIN | - | query |
| GET | /api/v1/dashboard/satisfaction-summary | ADMIN | - | query |
| GET | /api/v1/reports/tickets/export/pdf | ADMIN | - | ticketCsvValidation |
| GET | /api/v1/reports/tickets/export/csv | ADMIN | - | ticketCsvValidation |
| GET | /api/v1/reports/tickets | ADMIN | - | ticketReportValidation |
| GET | /api/v1/reports/date-range | ADMIN | - | dateRangeValidation |
| GET | /api/v1/reports/technician-performance | ADMIN | - | technicianPerformanceValidation |
| GET | /api/v1/reports/sla | ADMIN | - | slaReportValidation |
| GET | /api/v1/reports/categories | ADMIN | - | categoryReportValidation |
| GET | /api/v1/reports/priorities | ADMIN | - | priorityReportValidation |
| GET | /api/v1/reports/statuses | ADMIN | - | statusReportValidation |
| GET | /api/v1/reports/date-range/export/csv | ADMIN | - | dateRangeValidation |
| GET | /api/v1/reports/technician-performance/export/csv | ADMIN | - | technicianPerformanceValidation |
| GET | /api/v1/reports/sla/export/csv | ADMIN | - | slaReportValidation |
| GET | /api/v1/reports/categories/export/csv | ADMIN | - | categoryReportValidation |
| GET | /api/v1/reports/priorities/export/csv | ADMIN | - | priorityReportValidation |
| GET | /api/v1/reports/statuses/export/csv | ADMIN | - | statusReportValidation |
| GET | /api/v1/reports/analytics/export/pdf | ADMIN | - | technicianPerformanceValidation |
| GET | /api/v1/audit-logs | ADMIN | - | listValidation |

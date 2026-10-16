# SupportFlow — API Documentation

SupportFlow exposes a REST API for authentication, user management, ticket management, assignment workflows, communication, attachments, notifications, SLA management, knowledge-base content, dashboards, reports, and audit logs.

---

# 1. API Overview

## Base Path

```text
/api/v1
```

## Production API

```text
https://supportflow-iota.vercel.app/api/v1
```

## Health Check

```http
GET /health
```

Production health endpoint:

```text
https://supportflow-iota.vercel.app/api/v1/health
```

Example response:

```json
{
  "success": true,
  "message": "SupportFlow API is healthy",
  "data": {
    "server": "UP",
    "database": "UP"
  }
}
```

---

# 2. Authentication

SupportFlow uses:

- JWT access tokens
- Refresh tokens
- HttpOnly refresh-token cookies
- Role-based authorization
- Password hashing with bcrypt
- Password-reset tokens
- Session revocation

Supported roles:

```text
EMPLOYEE
TECHNICIAN
ADMIN
```

## Login

```http
POST /auth/login
```

Authenticates a user.

### Request Body

```json
{
  "email": "user@example.com",
  "password": "password"
}
```

### Example Success Response

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "<access-token>",
    "user": {
      "id": 1,
      "firstName": "John",
      "lastName": "Silva",
      "email": "john@example.com",
      "role": "EMPLOYEE"
    }
  }
}
```

The refresh token is stored using a secure HttpOnly cookie.

## Refresh Access Token

```http
POST /auth/refresh
```

Creates a new access token using the refresh-token cookie.

## Logout

```http
POST /auth/logout
```

Revokes the current refresh-token session.

## Logout All Sessions

```http
POST /auth/logout-all
```

Revokes all refresh-token sessions belonging to the authenticated user.

## Get Current User

```http
GET /auth/me
```

Returns the currently authenticated user's profile.

## Change Password

```http
PATCH /auth/change-password
```

### Request Body

```json
{
  "currentPassword": "CurrentPassword123!",
  "newPassword": "NewPassword123!"
}
```

## Forgot Password

```http
POST /auth/forgot-password
```

Starts the password-reset process.

### Request Body

```json
{
  "email": "user@example.com"
}
```

For security, the API returns a generic response regardless of whether the email exists.

## Reset Password

```http
POST /auth/reset-password
```

Resets a password using a valid password-reset token.

### Example Request Body

```json
{
  "token": "<reset-token>",
  "newPassword": "NewPassword123!"
}
```

---

# 3. User Management

User-management endpoints are primarily restricted to Administrators.

## Get Users

```http
GET /users
```

### Role

```text
ADMIN
```

### Supported Query Parameters

```text
page
limit
search
role
isActive
sortBy
order
```

### Example

```http
GET /users?page=1&limit=20&role=TECHNICIAN&order=DESC
```

### Example Response

```json
{
  "success": true,
  "data": {
    "users": []
  },
  "pagination": {
    "currentPage": 1,
    "limit": 20,
    "totalRecords": 0,
    "totalPages": 0,
    "hasNext": false,
    "hasPrevious": false
  }
}
```

## Get User by ID

```http
GET /users/:id
```

### Role

```text
ADMIN
```

## Create User

```http
POST /users
```

### Role

```text
ADMIN
```

### Example Request

```json
{
  "firstName": "Kasun",
  "lastName": "Perera",
  "email": "kasun@example.com",
  "role": "TECHNICIAN"
}
```

The created user may be required to change the temporary password on first login.

## Update User

```http
PATCH /users/:id
```

### Role

```text
ADMIN
```

## Activate / Deactivate User

```http
PATCH /users/:id/status
```

### Role

```text
ADMIN
```

### Example Request

```json
{
  "isActive": true
}
```

Users are deactivated rather than permanently deleted.

## Change User Role

```http
PATCH /users/:id/role
```

### Role

```text
ADMIN
```

### Example Request

```json
{
  "role": "TECHNICIAN"
}
```

---

# 4. Ticket Management

Tickets are the main resource of SupportFlow.

Typical lifecycle:

```text
OPEN
→ ASSIGNED
→ IN_PROGRESS
↔ WAITING_FOR_USER
→ RESOLVED
→ CLOSED
```

Reopen lifecycle:

```text
RESOLVED
→ REOPENED
→ IN_PROGRESS
```

## Create Ticket

```http
POST /tickets
```

### Role

```text
EMPLOYEE
```

### Example Request

```json
{
  "title": "Unable to connect to office Wi-Fi",
  "description": "Unable to connect after the latest Wi-Fi password update.",
  "categoryId": 1,
  "priorityId": 2
}
```

The system automatically generates a unique ticket number.

## Get Employee Tickets

```http
GET /tickets/my
```

Returns tickets belonging to the authenticated Employee.

## Get Ticket by ID

```http
GET /tickets/:id
```

Access depends on:

- role
- ownership
- assignment
- Administrator permissions

Employees can only access authorized tickets.

## Update Ticket

```http
PATCH /tickets/:id
```

Employees can update eligible ticket information while the ticket is in an allowed state.

## Ticket Queue

```http
GET /tickets/queue
```

### Roles

```text
TECHNICIAN
ADMIN
```

Used to display tickets available for technical support workflow.

## Get Assigned Tickets

```http
GET /tickets/assigned
```

### Role

```text
TECHNICIAN
```

Returns tickets assigned to the authenticated Technician.

## Update Ticket Status

```http
PATCH /tickets/:id/status
```

### Roles

```text
TECHNICIAN
ADMIN
```

The backend validates all status transitions.

### Example Request

```json
{
  "status": "IN_PROGRESS"
}
```

## Update Ticket Priority

```http
PATCH /tickets/:id/priority
```

### Roles

```text
TECHNICIAN
ADMIN
```

## Resolve Ticket

```http
PATCH /tickets/:id/resolve
```

### Roles

```text
TECHNICIAN
ADMIN
```

## Close Ticket

```http
PATCH /tickets/:id/close
```

Closing permissions depend on the current ticket state and user role.

## Reopen Ticket

```http
PATCH /tickets/:id/reopen
```

Reopening is only allowed from supported states.

---

# 5. Ticket Assignment

## Technician Self-Assign

```http
POST /tickets/:id/self-assign
```

### Role

```text
TECHNICIAN
```

Allows a Technician to assign an eligible unassigned ticket to themselves.

## Assign / Reassign Ticket

```http
POST /tickets/:id/assign
```

### Role

```text
ADMIN
```

### Example Request

```json
{
  "technicianId": 5
}
```

## Unassign Ticket

```http
POST /tickets/:id/unassign
```

### Role

```text
ADMIN
```

Removes the current Technician assignment when allowed.

## Get Assignment History

```http
GET /tickets/:id/assignments
```

Returns the assignment history of a ticket.

Assignment history may include:

```text
ASSIGNED
REASSIGNED
UNASSIGNED
```

---

# 6. Ticket Status History

SupportFlow records ticket status changes for traceability.

A history record may include:

- previous/current status
- changed by user
- timestamp
- remarks

Status history is used to track the lifecycle of each ticket.

---

# 7. Ticket Comments & Communication

SupportFlow supports two communication types:

```text
PUBLIC
INTERNAL
```

Public replies are visible to Employees.

Internal notes are restricted to Technicians and Administrators.

## Get Ticket Comments

```http
GET /tickets/:id/comments
```

Returns comments visible to the authenticated user.

Internal notes are excluded from Employee responses.

## Add Public Reply

```http
POST /tickets/:id/comments
```

### Example Request

```json
{
  "message": "I am still experiencing the same issue."
}
```

## Add Internal Note

```http
POST /tickets/:id/comments/internal
```

### Roles

```text
TECHNICIAN
ADMIN
```

### Example Request

```json
{
  "message": "Router logs indicate an authentication failure."
}
```

Internal notes must never be exposed to Employees.

---

# 8. Ticket Attachments

SupportFlow uses Multer for upload processing and Cloudinary for production file storage.

## Upload Attachment

```http
POST /tickets/:id/attachments
```

### Content Type

```text
multipart/form-data
```

Attachment validation includes:

- file type
- file extension
- MIME type
- file size
- attachment count

## Get Ticket Attachments

```http
GET /tickets/:id/attachments
```

Returns attachments accessible to the authenticated user.

---

# 9. Notifications

SupportFlow stores notifications in the database and also delivers realtime updates using Socket.IO.

## Get Notifications

```http
GET /notifications
```

Returns notifications belonging to the current user.

## Mark Notification as Read

```http
PATCH /notifications/:id/read
```

A user may only update their own notification.

## Mark All Notifications as Read

```http
PATCH /notifications/read-all
```

Marks all notifications belonging to the authenticated user as read.

## Realtime Notification Event

```text
notification:new
```

Socket.IO user room format:

```text
user:{id}
```

Notifications are persisted before realtime delivery.

If a realtime event is missed, the client can recover persisted notifications through REST refetching.

---

# 10. SLA Management

SupportFlow uses priority-based SLA policies.

Default SLA targets:

| Priority | Response Time | Resolution Time |
|---|---:|---:|
| Critical | 30 minutes | 4 hours |
| High | 1 hour | 8 hours |
| Medium | 4 hours | 24 hours |
| Low | 8 hours | 48 hours |

## Get SLA Policies

```http
GET /sla/policies
```

## Create SLA Policy

```http
POST /sla/policies
```

### Role

```text
ADMIN
```

## Update SLA Policy

```http
PATCH /sla/policies/:id
```

### Role

```text
ADMIN
```

SLA information may include:

- response deadline
- resolution deadline
- SLA status
- breach information
- ticket SLA snapshot

---

# 11. Knowledge Base

The Knowledge Base provides reusable support documentation.

## Get Knowledge-Base Articles

```http
GET /knowledge-base/articles
```

## Get Article by ID

```http
GET /knowledge-base/articles/:id
```

## Search Knowledge-Base Articles

```http
GET /knowledge-base/articles?search=wifi
```

## Create Article

```http
POST /knowledge-base/articles
```

### Role

```text
ADMIN
```

## Update Article

```http
PATCH /knowledge-base/articles/:id
```

### Role

```text
ADMIN
```

## Delete Article

```http
DELETE /knowledge-base/articles/:id
```

### Role

```text
ADMIN
```

## Submit Article Feedback

```http
POST /knowledge-base/articles/:id/feedback
```

Feedback may indicate whether the article was helpful.

---

# 12. Dashboard APIs

SupportFlow provides role-specific dashboard data.

## Admin Dashboard Summary

```http
GET /dashboard/admin/summary
```

Provides system-wide helpdesk summary information.

## Employee Dashboard Summary

```http
GET /dashboard/employee/summary
```

Returns ticket summary information for the authenticated Employee.

## Technician Dashboard Summary

```http
GET /dashboard/technician/summary
```

Returns Technician-specific workload and ticket information.

## Recent Tickets

```http
GET /dashboard/recent-tickets
```

## Technician Workload

```http
GET /dashboard/technician-workload
```

Provides workload information for Technicians.

## SLA Compliance

```http
GET /dashboard/sla-compliance
```

Provides SLA compliance metrics.

## Priority Distribution

```http
GET /dashboard/priority-distribution
```

Provides ticket distribution grouped by priority.

---

# 13. Analytics

SupportFlow provides analytics for areas such as:

- ticket status distribution
- priority distribution
- category distribution
- Technician workload
- ticket volume
- resolution performance
- SLA compliance
- recent activity

Analytics endpoints are primarily used by Administrator and Technician dashboards.

---

# 14. Reports

SupportFlow includes reporting capabilities for:

- tickets
- Technicians
- categories
- SLA performance
- date ranges

Supported export formats include:

```text
CSV
PDF
```

Reports are protected according to user role.

---

# 15. Audit Logs

Audit logging records important administrative and security-sensitive actions.

## Get Audit Logs

```http
GET /audit-logs
```

### Role

```text
ADMIN
```

Audit records may include:

- acting user
- action
- entity type
- entity identifier
- sanitized metadata
- IP address
- timestamp

Sensitive values are not stored in audit metadata.

---

# 16. Ticket Feedback

SupportFlow supports ticket feedback after eligible ticket completion.

Feedback may include:

- ticket reference
- user
- rating
- feedback information
- submission timestamp

Ratings are validated by the backend.

---

# 17. Standard Success Response

Successful API responses generally follow this structure:

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}
```

Some list endpoints also include pagination:

```json
{
  "success": true,
  "data": {
    "items": []
  },
  "pagination": {
    "currentPage": 1,
    "limit": 20,
    "totalRecords": 0,
    "totalPages": 0,
    "hasNext": false,
    "hasPrevious": false
  }
}
```

---

# 18. Standard Error Response

Errors generally follow:

```json
{
  "success": false,
  "message": "Request failed",
  "errors": []
}
```

Production responses do not expose:

- stack traces
- passwords
- JWT secrets
- refresh tokens
- SMTP credentials
- database credentials
- Cloudinary secrets

---

# 19. HTTP Status Codes

Common status codes used by SupportFlow include:

| Status | Meaning |
|---|---|
| `200` | Successful request |
| `201` | Resource created successfully |
| `204` | Successful request with no response body / preflight |
| `400` | Validation or bad request |
| `401` | Authentication required or invalid |
| `403` | User is authenticated but not authorized |
| `404` | Resource not found |
| `409` | Conflict, duplicate, or invalid state |
| `422` | Validation failure where applicable |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

# 20. Authorization Model

SupportFlow uses both role-based and resource-level authorization.

## Employee

Employees can generally:

- create tickets
- access their own tickets
- add public replies
- upload allowed attachments
- view their notifications
- access the Knowledge Base
- close/reopen eligible tickets

Employees cannot access internal Technician/Admin notes.

## Technician

Technicians can generally:

- access support queues
- self-assign eligible tickets
- access assigned tickets
- update ticket status
- add public replies
- add internal notes
- resolve tickets
- view SLA information
- view workload information

## Administrator

Administrators can generally:

- manage users
- manage roles
- activate/deactivate users
- view all tickets
- assign/reassign/unassign tickets
- manage categories
- manage SLA policies
- manage Knowledge Base content
- access reports
- access analytics
- access audit logs

---

# 21. Security

The SupportFlow API includes:

- JWT authentication
- refresh-token sessions
- HttpOnly cookies
- Secure cookies in production
- SameSite cookie configuration
- bcrypt password hashing
- role-based authorization
- resource ownership checks
- IDOR protection
- request validation
- parameterized SQL queries
- upload restrictions
- CORS origin restrictions
- Helmet security headers
- rate limiting
- login rate limiting
- sanitized production errors
- audit logging
- environment-variable-based secrets

---

# 22. Pagination

List endpoints may support:

```text
page
limit
```

Example:

```http
GET /users?page=1&limit=20
```

Other supported parameters depend on the resource and may include:

```text
search
status
role
priority
category
isActive
sortBy
order
dateFrom
dateTo
```

---

# 23. Sorting

Where supported:

```text
sortBy=<field>
order=ASC
```

or:

```text
order=DESC
```

Only approved sort fields are accepted by the backend.

---

# 24. Production Integrations

The production API integrates with:

| Service | Purpose |
|---|---|
| TiDB Cloud | Production relational database |
| Cloudinary | File and attachment storage |
| Brevo SMTP | Transactional email |
| Socket.IO | Realtime notifications |
| Vercel | Backend hosting |

---

# 25. API Testing

SupportFlow APIs were tested using Postman.

Test areas include:

- authentication
- refresh-token flows
- password changes
- password recovery
- user management
- role authorization
- ticket creation
- ticket retrieval
- ticket updates
- assignment
- reassignment
- unassignment
- ticket status transitions
- comments
- internal notes
- attachments
- notifications
- SLA management
- Knowledge Base
- dashboards
- reports
- audit logs
- negative tests
- authorization tests
- security scenarios

---

# 26. Production URL

```text
https://supportflow-iota.vercel.app/api/v1
```

Example:

```text
https://supportflow-iota.vercel.app/api/v1/health
```

---

# Notes

This document provides a portfolio-level overview of the SupportFlow REST API.

The backend route files remain the source of truth for exact endpoint paths, request fields, validation rules, and authorization requirements.

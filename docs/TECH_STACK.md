# SupportFlow — Technology Stack

SupportFlow is a full-stack IT Helpdesk and Ticket Management System built with a modern JavaScript-based architecture.

The technology stack was selected to support secure authentication, role-based workflows, realtime notifications, file uploads, reporting, analytics, and cloud deployment.

---

## 1. Frontend

### React

React is used to build the user interface as reusable components.

It is used for:

- Employee dashboard
- Technician dashboard
- Administrator dashboard
- Ticket management interfaces
- User management interfaces
- Notifications
- Knowledge Base
- Reports and analytics
- Authentication pages

---

### Vite

Vite is used as the frontend development and build tool.

Benefits:

- Fast development server
- Fast Hot Module Replacement
- Optimized production builds
- Environment variable support using `VITE_*`

---

### Tailwind CSS

Tailwind CSS is used for styling the frontend.

It provides:

- Responsive layouts
- Reusable utility-based styling
- Dark/light theme support
- Consistent spacing and typography
- Mobile-friendly interfaces

---

### React Router

React Router is used for client-side navigation.

It supports:

- Protected routes
- Role-based routes
- Employee routes
- Technician routes
- Administrator routes
- Authentication routes
- Password reset routes

---

### Axios

Axios is used for communication between the frontend and backend REST API.

SupportFlow uses Axios for:

- API requests
- Authentication requests
- Automatic access-token handling
- Refresh-token retry logic
- Credentialed requests
- Centralized API configuration

---

### TanStack Query

TanStack Query is used in selected frontend areas for server-state management.

It helps with:

- Data fetching
- Caching
- Refetching
- Loading states
- Error handling
- Query invalidation

Some older/current modules may still use direct `useEffect`-based API fetching where already implemented.

---

### Recharts

Recharts is used to visualize dashboard and analytics data.

It supports charts for:

- Ticket statistics
- Status distribution
- Priority distribution
- Category distribution
- Technician workload
- SLA metrics

---

### Socket.IO Client

Socket.IO Client is used for realtime communication with the backend.

It is used for:

- Realtime notifications
- User-specific notification rooms
- Connection/reconnection handling
- Live notification updates

Production uses WebSocket transport.

---

## 2. Backend

### Node.js

Node.js is used as the backend runtime.

It allows SupportFlow to use JavaScript across both the frontend and backend.

---

### Express.js

Express.js is used to implement the REST API.

It provides:

- Routing
- Middleware
- Request/response handling
- Error handling
- Authentication integration
- Authorization
- API versioning

Main API prefix:

```text
/api/v1
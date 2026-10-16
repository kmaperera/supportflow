# SupportFlow

SupportFlow is a full-stack IT Helpdesk and Ticket Management System designed to manage internal technical support workflows from ticket creation to resolution.

The system provides separate role-based experiences for Employees, Technicians, and Administrators. It includes ticket management, assignment workflows, comments, attachments, realtime notifications, SLA monitoring, knowledge-base management, analytics, reporting, and audit logging.

SupportFlow was developed as an individual portfolio project using React, Node.js, Express, TiDB, Socket.IO, Cloudinary, and JWT-based authentication.

---

## Live Demo

**Frontend:**  
https://supportflow-bao6.vercel.app

**Backend Health Check:**  
https://supportflow-iota.vercel.app/api/v1/health

> Demo account information will be added later.

---

## Main Features

- Secure authentication and role-based authorization
- Employee, Technician, and Admin dashboards
- Ticket creation and tracking
- Ticket assignment and reassignment
- Ticket status workflow management
- Priority and category management
- Public ticket replies
- Internal technician/admin notes
- File attachments using Cloudinary
- Realtime notifications using Socket.IO
- Email notifications and password recovery
- SLA response and resolution tracking
- Knowledge-base article management
- Dashboard analytics
- Reports and exports
- Audit logging
- User activation and deactivation

---

## User Roles

### Employee

Employees can:

- Create support tickets
- View and track their own tickets
- Add public replies
- Upload attachments
- View ticket status changes
- Close and reopen supported tickets
- Receive notifications
- Access the knowledge base

### Technician

Technicians can:

- View assigned tickets
- View available ticket queues
- Self-assign tickets
- Update ticket status
- Add public replies
- Add internal notes
- Resolve tickets
- Monitor SLA information
- View workload and statistics

### Administrator

Administrators can:

- Manage users
- Manage technicians
- Activate and deactivate users
- Manage ticket categories
- Configure SLA policies
- Assign and reassign tickets
- View all tickets
- Access analytics and reports
- Manage knowledge-base content
- View audit logs

---

## Technology Stack

### Frontend

- React
- Vite
- Tailwind CSS
- React Router
- Axios
- TanStack Query
- Recharts
- Socket.IO Client

### Backend

- Node.js
- Express.js
- MySQL2
- JWT
- bcryptjs
- Socket.IO
- Nodemailer
- Multer
- Cloudinary
- express-validator
- Helmet
- Morgan
- CORS

### Database

- TiDB Cloud
- MySQL-compatible relational database

### Deployment

- Vercel — Frontend
- Vercel — Backend
- TiDB Cloud — Production Database
- Cloudinary — File Storage
- Brevo SMTP — Transactional Email

---

## Project Structure

```text
supportflow/
├── client/        # React frontend
├── server/        # Node.js / Express backend
├── docs/          # Project and deployment documentation
├── README.md
└── .gitignore
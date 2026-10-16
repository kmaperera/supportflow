# SupportFlow — Feature List

SupportFlow is a full-stack IT Helpdesk and Ticket Management System designed to manage the complete lifecycle of internal IT support requests.

The system provides dedicated functionality for Employees, Technicians, and Administrators.

---

## 1. Authentication & Account Security

- User login
- JWT access-token authentication
- Refresh-token authentication
- Secure HttpOnly refresh cookies
- Role-based authorization
- Automatic session restoration
- Logout
- Logout from all sessions
- Change password
- Forgot password
- Password reset through email
- Password reset token expiration
- Forced password change for newly created users
- Account activation and deactivation
- Secure password hashing using bcrypt

---

## 2. User Management

### Administrator

- View all users
- Search users
- Filter users by role
- Filter users by account status
- Paginated user listing
- Create users
- Update user information
- Activate users
- Deactivate users
- Change user roles
- Reset user passwords
- View available technicians

Supported roles:

- Employee
- Technician
- Administrator

---

## 3. Ticket Creation & Management

### Employee

- Create support tickets
- Select ticket category
- Select priority
- Enter ticket title and description
- Automatically generate unique ticket numbers
- View own tickets
- View ticket details
- Update eligible tickets
- Search tickets
- Filter tickets
- Sort tickets
- Track ticket status

### Technician / Administrator

- View ticket queues
- View ticket details
- Search tickets
- Filter tickets
- Sort tickets
- Paginated ticket listing
- Manage ticket priority
- Manage ticket workflow

---

## 4. Ticket Assignment

- Technician self-assignment
- Administrator ticket assignment
- Administrator ticket reassignment
- Administrator ticket unassignment
- Assignment history
- Technician workload information
- View assigned tickets
- View unassigned ticket queue
- Assignment consistency validation

---

## 5. Ticket Workflow

Supported lifecycle:

```text
OPEN
  ↓
ASSIGNED
  ↓
IN_PROGRESS
  ↕
WAITING_FOR_USER
  ↓
RESOLVED
  ↓
CLOSED
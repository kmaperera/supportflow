# SupportFlow — Demo Accounts

SupportFlow includes dedicated demo accounts that can be used to explore the deployed application without using personal or production administrator credentials.

## Live Application

```text
https://supportflow-bao6.vercel.app
```

---

# 1. Employee Demo

## Login Credentials

**Email**

```text
employee.demo@supportflow.com
```

**Password**

```text
Demo@Employee123
```

## Available Features

The Employee demo account can be used to explore:

- Employee dashboard
- Creating support tickets
- Viewing personal tickets
- Tracking ticket status
- Adding public replies
- Uploading allowed attachments
- Viewing notifications
- Browsing the Knowledge Base
- Closing eligible tickets
- Reopening eligible tickets
- Submitting ticket feedback

---

# 2. Technician Demo

## Login Credentials

**Email**

```text
technician.demo@supportflow.com
```

**Password**

```text
Demo@Technician123
```

## Available Features

The Technician demo account can be used to explore:

- Technician dashboard
- Viewing assigned tickets
- Viewing the support queue
- Self-assigning eligible tickets
- Updating ticket status
- Adding public replies
- Adding internal notes
- Resolving tickets
- Viewing SLA information
- Viewing workload information
- Receiving notifications

---

# 3. Administrator Demo

Public administrator credentials are not included in this repository because the Administrator role contains sensitive system-management permissions.

Administrator access can be demonstrated during a supervised walkthrough.

## Administrator Features

Administrator functionality includes:

- User management
- Role management
- Technician management
- Ticket assignment
- Ticket reassignment
- Ticket unassignment
- Ticket category management
- SLA policy management
- Knowledge Base management
- System-wide analytics
- Reports and exports
- Audit log access

---

# 4. Demo Account Safety

These accounts are intended only for portfolio and demonstration purposes.

The demo accounts should not contain real personal data, confidential business information, or sensitive credentials.

Do not reuse any real production administrator password for a demo account.

Do not store the following information in this file:

- Database passwords
- JWT secrets
- SMTP credentials
- Cloudinary secrets
- API keys
- Personal account passwords
- Production administrator credentials

---

# 5. Recommended Demo Usage

For a normal project demonstration, use the accounts in this order:

1. Log in as the Employee demo account and create a support ticket.
2. Log in as the Technician demo account and view or self-assign the ticket.
3. Update the ticket status and add a reply or internal note.
4. Return to the Employee account and confirm the visible update.
5. Use Administrator access only during a supervised walkthrough when demonstrating management, analytics, reports, SLA configuration, or audit functionality.

---

# Notes

The Employee and Technician accounts are intended to provide safe access to the main SupportFlow workflow.

Administrator credentials should remain private unless a separate restricted demo administrator account is deliberately created for supervised demonstrations.

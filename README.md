# SupportFlow

SupportFlow is a full-stack IT Helpdesk and Ticket Management System for managing support requests, ticket workflows, technician assignments, SLA tracking, notifications, and reporting.

## Local environment setup

Copy `server/.env.example` to `server/.env` and `client/.env.example` to `client/.env`. Fill backend placeholders with your own local values; never commit actual env files. Run backend commands from `server/`; server startup resolves its env file relative to the server directory. Existing deployment environment variables take precedence.

Supply database credentials and Cloudinary configuration. Supply distinct JWT signing secrets (use independently generated random values of at least 32 characters) and access/refresh lifetimes. Email is optional: leave SMTP fields and `EMAIL_FROM_ADDRESS` blank to disable it, or configure the whole group. Initial admin variables are required only by `npm run seed:admin`; use a unique password and change it after first login. Passwords and signing keys are preserved exactly, including intentional whitespace.

Only `VITE_API_BASE_URL` belongs in the client env. Every `VITE_*` value is public browser configuration. Store production secrets in the hosting provider environment or secret manager, never source control. If a credential is committed, rotate it at its provider; deleting it from a file does not remove Git history. JWT key rotation invalidates issued tokens. Deployment implementation remains in Phase 20.

See [Phase 18.13 environment-secret review](server/ENV_SECRET_REVIEW.md) for classifications, findings and verification.

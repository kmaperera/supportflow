# SupportFlow

## Production deployment

- Frontend: https://supportflow-bao6.vercel.app
- Backend: https://supportflow-iota.vercel.app

See the [production deployment guide](docs/DEPLOYMENT.md) for Vercel setup, TiDB migrations/seeds, environment variables, Admin bootstrap, Cloudinary/Brevo, verification, limitations and troubleshooting. The [Phase 20.1 plan](docs/DEPLOYMENT_PLAN.md) is a historical snapshot.

SupportFlow is a full-stack IT Helpdesk and Ticket Management System for managing support requests, ticket workflows, technician assignments, SLA tracking, notifications, and reporting.

## Local environment setup

Copy `server/.env.example` to `server/.env` and `client/.env.example` to `client/.env`. Fill backend placeholders with your own local values; never commit actual env files. Run backend commands from `server/`; server startup resolves its env file relative to the server directory. Existing deployment environment variables take precedence.

Supply database credentials and Cloudinary configuration. Supply distinct JWT signing secrets (use independently generated random values of at least 32 characters) and access/refresh lifetimes. Email is optional: leave SMTP fields and `EMAIL_FROM_ADDRESS` blank to disable it, or configure the whole group. Initial admin variables are required only by `npm run seed:admin`; use a unique password and change it after first login. Passwords and signing keys are preserved exactly, including intentional whitespace.

Only `VITE_API_BASE_URL` belongs in the client env. Every `VITE_*` value is public browser configuration. Store production secrets in the hosting provider environment or secret manager, never source control. If a credential is committed, rotate it at its provider; deleting it from a file does not remove Git history. JWT key rotation invalidates issued tokens.

See [Phase 18.13 environment-secret review](server/ENV_SECRET_REVIEW.md) for classifications, findings and verification.

See [Security architecture and final Phase 18 review](docs/SECURITY.md) for the final checklist, audit events, verification, known limitations and production requirements.

Password recovery and Admin reset require migration `022_create_password_reset_tokens_table.sql`, a trusted `CLIENT_URL`, and working SMTP configuration. Reset links expire after 15 minutes by default (`PASSWORD_RESET_TTL_MINUTES`, 5â€“30). See the [password recovery implementation and verification](server/PASSWORD_RECOVERY_REVIEW.md) for account/session policy, delivery behavior and regression commands.

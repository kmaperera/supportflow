# Phase 20.3 — production MySQL setup

Status: **pending provider access and live verification**, not complete. No production service, schema container, user, password, or certificate was created in this session. No migrations or seeds were executed. Phase 20.4 has not begun. Local development env files remain unchanged. No production connection settings were supplied. Do not substitute the local database for production evidence.

## Provider choice and access prerequisite

Recommended provider: **Aiven for MySQL**, suitable for a small portfolio workload subject to its limits. This is a recommendation, not a provisioned service or confirmed account selection. No Aiven provisioning connector was found in the available plugin search. An authenticated provider console/API session or an existing service with credentials securely configured locally is needed to continue. Never paste passwords, API tokens, or credential-bearing URLs into chat.

Official documentation reviewed on 2026-10-15:

- [Free-tier limits](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier): verify current capacity, retention, available features, and restrictions before creating the service. Documentation lists a 76-connection limit; the deployed value still needs measurement.
- [Free MySQL offering](https://aiven.io/free-mysql-database): currently advertises 1 GB storage, 1 GB RAM, one CPU and no high availability. Services may power off after inactivity; do not assume uninterrupted availability. No specific monthly traffic quota or live backup retention is confirmed here.
- [Service creation](https://aiven.io/docs/products/mysql/get-started): available plans and location controls depend on tier. Do not assume a free-tier region can be selected.
- [TLS certificates](https://aiven.io/docs/platform/concepts/tls-ssl-certificates): obtain the project's CA certificate for verified MySQL connections.
- [Service users](https://aiven.io/docs/products/mysql/howto/manage-service-users): review grants carefully; do not give the runtime user global administration privileges.

Do not upgrade to a paid plan or create unrelated hosting services as part of this preparation. Record actual tier, version, resource/usage limits, sleep rules, backup retention/restore capability, and network restrictions from the provisioned service before sign-off. Public documentation does not establish those facts for an account that has not been accessed.

## Provisioning procedure (not executed)

1. Use the owner's provider account; enable MFA, a unique account password, and minimal team permissions. Create only a MySQL service and empty database container named `supportflow_prod` (or a provider-permitted equivalent).
2. Choose a supported MySQL 8-compatible engine; record the exact version. Compatibility of migrations/generated SQL must be rehearsed in Phase 20.4, not inferred from a successful connection.
3. Set database charset utf8mb4 and a provider-supported MySQL 8 collation such as utf8mb4_0900_ai_ci. Confirm compatibility with existing lookup/uniqueness behavior before changing collation defaults.
4. Create a dedicated `supportflow_app` account using a newly generated password in the provider secret store. Grant only SELECT, INSERT, UPDATE, DELETE on the production schema. Do not use root or the provider administrative account for app runtime. Inspect actual grants; a schema-wide grant can be prepared before tables exist. Use TLS-required account policy if supported.
5. Keep migration administration separate. Retain a restricted migration identity for Phase 20.4; determine its required CREATE/ALTER/INDEX and other schema permissions by reviewing the migration chain then. Never give runtime global privileges or GRANT OPTION. Aiven documents admin-level defaults for new service users: create with an explicit empty `mysql_grants` list where supported, then grant schema-scoped runtime privileges using an administrative session. Verify effective grants rather than assuming the console's new user is restricted.
6. Restrict connectivity to trusted current operator/backend egress IPs or supported private networking. Record whether the actual service is public, private-only, or allowlisted. Do not silently allow all addresses for convenience. Check free-tier availability of networking controls.
7. Download the provider CA through the authenticated console and configure verified TLS. Record certificate renewal/rotation guidance without committing credentials. Use the provider DNS hostname matching the certificate, not an IP alias.
8. Store runtime and migration credentials separately in the deployment secret store. For local verification, use a temporary ignored `server/.env.production-check.local` file containing only production DB settings. Verify it is ignored before writing. Never overwrite `server/.env`; never load production settings implicitly in ordinary local development.

## Provider-to-SupportFlow mapping

| Provider value | SupportFlow variable | Handling |
| --- | --- | --- |
| DNS hostname | DB_HOST | Backend only; do not publish actual endpoint identifiers. |
| TCP port | DB_PORT | Integer; use assigned port, not assumed 3306. |
| Empty schema container | DB_NAME | Explicit production database, not a default test schema. |
| Dedicated runtime username | DB_USER | Backend only; verify scoped grants. |
| Generated runtime password | DB_PASSWORD | Secret; never command-line argument/history/log/Git. |
| TLS selection | DB_SSL=true | Required by this deployment plan, regardless of provider plaintext acceptance. |
| PEM CA bundle | DB_SSL_CA | Backend configuration; actual newlines or literal backslash-n supported. |

SupportFlow consumes individual variables, not MYSQL_URL/DATABASE_URL. Do not refactor or pass a connection URL through frontend VITE variables. Backend TLS already supports CA/identity verification with TLS >=1.2; no source changes are needed for the documented Aiven CA model.

## Read-only connection verification (pending)

Run from a trusted machine with the runtime identity. For a MySQL CLI session, supply host/port/user/database through a protected defaults file or interactive settings and use `--password` without a value to prompt. Use `--ssl-mode=VERIFY_IDENTITY` and the provider CA; never use a password in a command string. Do not record raw grants/endpoint identifiers in public output.

Run only these metadata/readiness checks; none creates application tables:

```sql
SELECT 1;
SELECT DATABASE(), VERSION(), NOW(), UTC_TIMESTAMP();
SELECT @@session.time_zone, @@global.time_zone, @@system_time_zone;
SELECT @@session.sql_mode, @@global.max_connections;
SELECT @@character_set_database, @@collation_database;
SHOW SESSION STATUS LIKE 'Ssl_cipher';
SHOW SESSION STATUS LIKE 'Ssl_version';
SHOW GRANTS FOR CURRENT_USER;
SELECT COUNT(*) AS application_table_count
FROM information_schema.tables WHERE table_schema = DATABASE();
```

Expected: selected database is production, encrypted cipher is nonempty, database charset is utf8mb4, strict SQL mode is retained, effective time is UTC, and application table count is zero. Record sanitized facts, not credentials. If the schema has existing user tables, stop and identify ownership instead of deleting them. `SYSTEM` timezone is acceptable only after verifying its effective UTC behavior. Existing mysql2 connection/date handling is unchanged; ensure the eventual Node host also runs UTC. Do not claim UTC from NOW alone or weaken strict SQL mode to hide compatibility problems.

Then test the **actual backend pool** using the temporary production DB env settings: acquire a connection, SELECT 1, inspect TLS session status on that connection, release, reacquire, SELECT 1, and close the pool. It has `connectionLimit:10`, `waitForConnections:true`, `queueLimit:0`; compare 10 plus administrative/monitoring connections against measured server and per-user limits. Multiple backend instances multiply the budget.

Finally launch `npm start` on a free local port with those DB variables scoped to that child process, retaining the other local required configuration only for startup. Probe `/api/v1/health`, then stop that owned process and clear temporary production secrets. Health uses SELECT 1 and can pass on an empty schema. Do not log in or call ticket/user endpoints before migrations. Normal startup validates env, tests DB, and starts HTTP/Socket.IO; it does not run DDL, schema sync, or seeds.

Run a harmless invalid-port connection attempt in a separate child configuration if practical. Expect a bounded generic connection failure with no password/URL printed; do not mutate the real service or disable certificate validation to force success. The production pool/error-path checks remain unexecuted until credentials are available.

## Backup and free-tier operating plan

Before future destructive changes, use a provider snapshot/export if available and verify its restore capability and retention for the actual plan. Keep an independent encrypted logical export outside Git; restrict access and define retention. A manual command template (not executed) is:

```text
mysqldump --defaults-extra-file=<protected-client-options-file> --single-transaction --no-tablespaces --set-gtid-purged=OFF --databases supportflow_prod --result-file=<restricted-backup-path>
```

The protected options file supplies credentials and verified TLS settings; it must not be committed or printed. Use a compatible MySQL client and backup identity with only necessary backup privileges. Avoid concurrent DDL during the dump. Restore-test to a separate disposable database before relying on it. Backups contain user data/password hashes; encrypt and retain them according to policy. Never import a dump into the live DB just to test backup validity. Coordinate Cloudinary asset retention separately.

Free-tier storage and connections, no HA, inactivity shutdown, retention/restore restrictions, support and usage policies are release constraints. Do not promise a production SLA or a guaranteed free allowance. Record actual console settings and monthly limits before completing this phase.

## Current completion checklist

| Check | Current result |
| --- | --- |
| Provider recommendation / env mapping | Prepared; Aiven recommended, account/service not accessed. |
| Host/port/database/runtime user/password | Not supplied or created. |
| Actual version, charset/collation, UTC, strict mode | Unknown; read-only verification pending. |
| Provider connection/network/backup limits | Documentation reviewed; actual setup unverified. |
| Backend verified TLS support | Confirmed in Phase 20.2 config; remote handshake not yet tested. |
| Raw / backend production connection tests | NOT RUN. |
| Production table count | Unknown; no database was accessed. |
| Migrations / seeds | NOT RUN; reserved for Phase 20.4. |
| Application code changes | None. |
| Ready for Phase 20.4 | NO — provision and verify production MySQL first. |

Next required input is provider account access or the path to securely supplied production DB configuration. Do not treat this setup procedure as evidence that the service exists.

# Baloch Builder

Multi-user real-estate accounting with the existing React login, sidebar and theme. Phase 1 adds PostgreSQL-backed projects, users/roles/assignments, accounts, periods, journal vouchers, immutable posting, audit and Trial Balance. Only the working area uses AG Grid. Payments remain blocked until Phase 2 approval is implemented.

The old SQLite/Tauri data layer is retained for Phase 6 migration. The server does **not** import or overwrite desktop data. Although the protected login/sidebar still use their original “local workspace” wording, new web accounting records are stored centrally in PostgreSQL.

## Development

Use Node.js 24+ and PostgreSQL 18. From the repository root:

```sh
npm ci
```

Provision a dedicated database once using administrator credentials. Use `.env.example` as a guide and export its variables in your shell (Node does not automatically load `.env`). Set distinct `OWNER_PASSWORD` and `APP_PASSWORD`, and `ADMIN_DATABASE_URL` to the dedicated database. Run `node scripts/init-database.mjs` (repeatable). Then set `OWNER_DATABASE_URL` to the `baloch_owner` connection and `DATABASE_URL` to the `baloch_app` connection. For an existing Phase 1 database, back it up first and run provisioning with `--adopt-existing` to transfer its public tables/functions to the owner. Never use that flag on a shared database. Then:

```sh
npm run migrate -w @baloch/server
# Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) in the environment first.
npm run seed -w @baloch/server
npm run dev:server
# In another terminal:
npm run dev
```

The frontend is at `http://localhost:1420`, with `/api` proxied to port 3000. Enter the admin email in the existing **Username** field. Seed is deliberately refused once users exist. Create subsequent accounts in the Users grid; create a fiscal month before entering vouchers. Every line needs an account code and project code. Ctrl+V accepts tab-separated Excel rows. Save/Post are disabled for invalid or unbalanced amounts. Edits to posted entries require a reversing draft in an open period.

For optional TOTP, set `TOTP_ENCRYPTION_KEY` to 64 random hexadecimal characters on the server. Use Two-factor setup in the working area, enter your password, add the generated secret to an authenticator, and confirm its code. The next login requires a fresh unused code. Keep the encryption key in your secret backup; database recovery alone cannot recover encrypted TOTP secrets without it.

## Tests and builds

Tests must use a disposable database named `baloch_test`. Server tests reset **that database's public schema** and run all migrations in order; never point tests at real accounting data.

```sh
# Provision baloch_test as above; set both OWNER_DATABASE_URL and DATABASE_URL to it
npm run typecheck
npm run lint
npm test
npm run test:server
npm run build
```

`npm test` retains every existing frontend/SQLite test and adds accounting frontend, shared and PostgreSQL tests. CI provides an empty PostgreSQL service. `npm run test:legacy` runs frontend tests only. On Windows, if the runner's temporary directory is inaccessible, set TEMP and TMP to a writable local directory before running tests.

## VPS deployment

Use one HTTPS origin for the frontend and API. Fastify serves the root `dist/` after `npm run build`. Set `NODE_ENV=production`, `DATABASE_URL`, `TOTP_ENCRYPTION_KEY`, and an absolute persistent `ATTACHMENT_DIR`. Put the server behind an HTTPS reverse proxy; port 3000 and PostgreSQL must not be publicly exposed. Do not enable unrestricted CORS. Set `TRUST_PROXY` only when deploying behind a real, controlled reverse proxy (details below).

For local Compose, set `POSTGRES_PASSWORD`, `OWNER_PASSWORD`, `APP_PASSWORD` and `TOTP_ENCRYPTION_KEY` in the shell or an untracked `.env`, then:

```sh
docker compose up --build -d
# Bootstrap using environment variables, not a committed password:
docker compose exec -e ADMIN_EMAIL -e ADMIN_PASSWORD server npm run seed -w @baloch/server
```

Compose exposes ports only on localhost, waits for PostgreSQL health, runs ordered migrations, and persists the database and attachments. `NODE_ENV=production` uses Secure cookies: use an HTTPS reverse proxy for browser login, or explicitly use development mode for local HTTP testing. Production migrations should be run by a schema owner; use a separate non-superuser runtime role with no DDL/TRUNCATE privileges. Never run the public application with a PostgreSQL superuser. Restrict runtime audit-log privileges to SELECT/INSERT; revoke UPDATE/DELETE/TRUNCATE. Database owners can always disable triggers, so owner credentials must stay out of the runtime service.

## Nightly backup and restore

Install PostgreSQL client utilities on the VPS. Set `DATABASE_URL`, `ATTACHMENT_DIR` and optionally `PG_BIN` (the PostgreSQL bin directory on Windows). Run:

```sh
node scripts/backup.mjs /var/backups/baloch
```

This creates a timestamped directory with a custom-format `database.dump` and copies attachments if configured. Treat a nonzero exit as a failed backup. Copy successful backups and the separately stored TOTP key to encrypted off-site storage. Retention/deletion is an operator policy; the script does not silently delete historical backups.

Install `scripts/baloch-backup.service` and `scripts/baloch-backup.timer` into `/etc/systemd/system`, adapt the service user/paths, and create `/etc/baloch-backup.env` with mode 0600 containing the environment settings. Then enable the timer with `systemctl enable --now baloch-backup.timer`. It schedules 02:00 Asia/Karachi and catches missed runs. Monitor the unit's exit status and alert on failures.

Restore only to a newly created, empty database. Provision the empty target with `scripts/init-database.mjs`, then set `OWNER_DATABASE_URL` and optionally an empty `RESTORE_ATTACHMENT_DIR`:

```sh
node scripts/restore.mjs /path/to/timestamped-backup
```

Restore runs in one transaction with no destructive `--clean`. Verify migrations, account/entry counts, Trial Balance and attachments before changing service configuration to use the restored database. Test this recovery procedure regularly. Docker images do not include a scheduler or pg_dump; run the provided timer from the VPS host with PostgreSQL client tools and access to the attachment volume.

## Retained desktop client

`npm run dev:legacy` previews the retained frontend wiring; actual SQLite/desktop authentication needs Tauri. The Tauri source, migrations and Rust Drive backup are unchanged by this rewrite except for pre-existing local work. To build the historical offline frontend, use `vite build --mode legacy` with the retained Tauri build configuration. The new multi-user browser application is the supported Phase 1 path; no packaged Tauri/server integration is claimed as tested.

See [REWRITE_PLAN](docs/REWRITE_PLAN.md), [DECISIONS](docs/DECISIONS.md) and [CHANGES](docs/CHANGES.md). Stop after Phase 1 for review before building payment approval.

### Database privilege boundary

`baloch_owner` owns the dedicated database, public schema, tables and functions and is used only for migrations/restores. `baloch_app` owns nothing and has no role memberships or superuser/createdb/createrole/bypassrls rights. Startup rejects an unsafe runtime identity. Business tables allow SELECT/INSERT/UPDATE; only sessions allow DELETE. Attachments and audit allow SELECT/INSERT; schema_migrations is read-only. No runtime role gets DDL or TRUNCATE. Trigger functions use the caller's privileges, including writes to audit_log and voucher_series.

Migration 004 defines owner-specific defaults for future public business tables (SELECT/INSERT/UPDATE only) and functions (EXECUTE to the app, not PUBLIC). Always migrate as baloch_owner. In the same migration transaction, revoke UPDATE for append-only tables and explicitly grant DELETE only where application code needs it. No sequence privileges are needed by the current UUID-based schema; future sequence-backed migrations must explicitly grant USAGE on their sequences. Keep audit triggers even though table grants also enforce immutability.

Compose runs an administrator-only provisioning job, then migrations with the owner connection. It unsets OWNER_DATABASE_URL before starting the application process. The owner URL remains available to container administration through configuration; restrict Docker access and use a separate deployment migration job if stronger secret separation is required. Existing Compose volumes keep their original POSTGRES_USER: for an old `baloch` superuser installation, use that administrator in provisioning and the health check while upgrading, or restore into a new volume. Changing POSTGRES_USER does not rename an existing role.

Backups use the app URL: SELECT on all current tables is enough for pg_dump. Restore uses the owner URL against an empty, pre-provisioned database (never the live runtime URL); --no-owner makes restored objects owned by baloch_owner and retains ACL/default privilege records. Keep role names stable across recovery environments. After restoring, run migrations as owner and verify the limited app role before reopening traffic.

### Proxy trust and login limits

`TRUST_PROXY` defaults to `off`: forwarded headers are ignored. Set a comma-separated list of trusted proxy IPs/CIDRs (for example `127.0.0.1,::1`) or a trusted hop count (for example `1`). Prefer explicit addresses; a hop count assumes every path has that many controlled proxies. Fastify resolves the client from X-Forwarded-For only through the configured trust chain. Restrict direct access to the server and have the edge proxy replace inbound forwarding headers. Enabling trust without a real proxy lets clients fake their IP and bypass limits.

Login allows five attempts per minute per client IP plus normalized email, with a separate cap of thirty attempts per minute per client IP across all emails. Limits are in process memory: this deployment assumes one server process; horizontally scaled deployments need a shared rate-limit store. Unknown and inactive users still run Argon2 verification. Unauthenticated non-login traffic does not write audit rows. Only accepted login attempts can write failure audit rows, and emails are validated and limited to 254 characters.

### Session expiry

Sessions last eight hours. A 401 from an authenticated API action clears the browser's in-memory session and returns to the unchanged login page. At the user's request, the message “Your session has expired. Please sign in again.” appears beside that page rather than changing AuthPage's internal error line. A first anonymous visit has no expiry warning. Login failures continue to use the existing form error. Empty/non-JSON gateway errors are reported without trying to display HTML. Expired database session rows are removed at server startup and on rate-limit-accepted login attempts, using an expiry index; unexpired rows are retained. Deactivated users cannot use existing sessions.

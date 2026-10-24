# Baloch Builder

Multi-user real-estate accounting with the existing React login, sidebar and theme. Phase 1 adds PostgreSQL-backed projects, users/roles/assignments, accounts, periods, journal vouchers, immutable posting, audit and Trial Balance. Only the working area uses AG Grid. Payments remain blocked until Phase 2 approval is implemented.

The old SQLite/Tauri data layer is retained for Phase 6 migration. The server does **not** import or overwrite desktop data. Although the protected login/sidebar still use their original “local workspace” wording, new web accounting records are stored centrally in PostgreSQL.

## Development

Use Node.js 24+ and PostgreSQL 18. From the repository root:

```sh
npm ci
```

Set `DATABASE_URL` to a dedicated application database, for example `postgres://baloch:your-password@127.0.0.1:5432/baloch`. Then:

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
# Set DATABASE_URL=postgres://.../baloch_test
npm run typecheck
npm run lint
npm test
npm run test:server
npm run build
```

`npm test` retains every existing frontend/SQLite test and adds accounting frontend, shared and PostgreSQL tests. CI provides an empty PostgreSQL service. `npm run test:legacy` runs frontend tests only. On Windows, if the runner's temporary directory is inaccessible, set TEMP and TMP to a writable local directory before running tests.

## VPS deployment

Use one HTTPS origin for the frontend and API. Fastify serves the root `dist/` after `npm run build`. Set `NODE_ENV=production`, `DATABASE_URL`, `TOTP_ENCRYPTION_KEY`, and an absolute persistent `ATTACHMENT_DIR`. Put the server behind an HTTPS reverse proxy; port 3000 and PostgreSQL must not be publicly exposed. Do not enable unrestricted CORS. The default login limit is based on the direct peer IP; with a reverse proxy it is shared by that proxy until a narrowly trusted proxy configuration is explicitly added.

For local Compose, set `POSTGRES_PASSWORD` and `TOTP_ENCRYPTION_KEY` in the shell or an untracked `.env`, then:

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

Restore only to a newly created, empty database. Set `TARGET_DATABASE_URL` and optionally an empty `RESTORE_ATTACHMENT_DIR`:

```sh
node scripts/restore.mjs /path/to/timestamped-backup
```

Restore runs in one transaction with no destructive `--clean`. Verify migrations, account/entry counts, Trial Balance and attachments before changing service configuration to use the restored database. Test this recovery procedure regularly. Docker images do not include a scheduler or pg_dump; run the provided timer from the VPS host with PostgreSQL client tools and access to the attachment volume.

## Retained desktop client

`npm run dev:legacy` previews the retained frontend wiring; actual SQLite/desktop authentication needs Tauri. The Tauri source, migrations and Rust Drive backup are unchanged by this rewrite except for pre-existing local work. To build the historical offline frontend, use `vite build --mode legacy` with the retained Tauri build configuration. The new multi-user browser application is the supported Phase 1 path; no packaged Tauri/server integration is claimed as tested.

See [REWRITE_PLAN](docs/REWRITE_PLAN.md), [DECISIONS](docs/DECISIONS.md) and [CHANGES](docs/CHANGES.md). Stop after Phase 1 for review before building payment approval.

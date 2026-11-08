# Baloch Builder — fresh start

The application is reset to its login, session security, theme, sidebar, and responsive Work in progress pages. Dashboard opens after sign-in. Projects now lists saved draft projects in a responsive four-column card grid. New project opens a name-only modal; Next saves a draft. Lands, Personal Expenses, Udhaar, Personal Deposit, both Bank pages, and Settings remain placeholders.

Old business modules, API routes, desktop SQLite commands and business tests have been removed. Migration 016 permanently removes the PostgreSQL business tables and clears sessions and audit history. Login accounts and their password hashes are preserved. Migration 017 adds the new minimal project-drafts table. Earlier migrations remain immutable history so existing installations can upgrade safely.

## Run locally

Use Node.js 24+ and PostgreSQL 18. Configure `.env.local` using `.env.example`; keep the existing local database credentials. PostgreSQL must be running.

```sh
npm ci
node --env-file=.env.local --import tsx server/src/migrate.ts
npm run dev:server
# In a second terminal:
npm run dev
```

`npm run dev:server` automatically reads `.env.local`. The frontend uses `API_PROXY_TARGET` to reach the server. `npm run tauri:dev` opens the retained desktop shell with this frontend; the API server and PostgreSQL are still required.

For a fresh database, use `scripts/init-database.mjs` to provision the owner/runtime roles, run migrations, and run `server/src/seed.ts` with `ADMIN_USERNAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ characters). Seed creates login only and never resets an existing password.

## Verification

```sh
npm run typecheck
npm test
npm run lint
npm run build
```

The app locks when hidden/minimized or after a detected execution pause. Server sessions expire after 30 seconds without a heartbeat. Login and password hashing remain server-side. The password-change API remains available for the future Settings implementation.

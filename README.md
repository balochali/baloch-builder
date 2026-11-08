# Baloch Builders & Developers

The React desktop shell uses Fastify and a local PostgreSQL database. Projects includes Feasibility, Land, Building, Partners and Transactions. Setup includes a read-only Chart of Accounts.

## Run locally

Use Node.js 24+ and PostgreSQL 18, the version pinned by Compose and CI. Configure `.env.local` from `.env.example` and start PostgreSQL. For a fresh database, use `scripts/init-database.mjs` with the administrator connection and separate owner and runtime passwords. Keep numbered migrations immutable.

```sh
npm ci
node --env-file=.env.local --import tsx server/src/migrate.ts
npm run dev:server
# In another terminal
npm run dev
```

To create the first login, run `server/src/seed.ts` with `ADMIN_USERNAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ characters). `npm run tauri:dev` launches the desktop shell and still requires the API and PostgreSQL.

## Storage and accounting

The journal is the source of truth for balances. Values are whole rupees, and journal debit and credit columns are bigint. Posting writes a balanced voucher and its lines atomically. Editing or voiding retains history and posts a reversal. Database constraints check balance at transaction end and protect journal rows from rewrites.

Partner identity comes from the master `partners` table. Project links reference master IDs. Feasibility, land parcels and building plans live in `projects.details` JSON. Parcel files are linked to the existing PostgreSQL file store. Feasibility records plans, with posted amounts derived separately from the journal.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run test:postgres
npm run build
```

The PostgreSQL tests require a migrated local database, its owner/runtime connections and an active administrator. The test data is rolled back. `npm run seed:demo` loads the Baloch Heights demo on a local database and replaces its feasibility plan. It reuses master partners and skips demo postings already present.

Sessions lock when the app is hidden or suspended. The server rejects sessions after 30 seconds without a heartbeat.

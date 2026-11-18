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

To create the first login, run `server/src/seed.ts` with `ADMIN_USERNAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ characters). Start PostgreSQL before running `npm run tauri:dev`, or set `BALOCH_PGDATA` and `BALOCH_PGBIN` in `.env.local` to an existing local cluster and the PostgreSQL binaries directory. With these settings the desktop launcher starts PostgreSQL automatically on the port in `DATABASE_URL` (host must be `127.0.0.1`). It then starts the API if needed and waits for its database health check before opening the window. It never initializes or replaces database files. Keep the database directory outside temporary and test folders, and retain regular database backups.

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

## Land purchases

The Land tab records seller agreements, split instalments, direct partner/Owner/lender payments, related costs and contributed land. Every action posts balanced journal entries; editing reverses and replaces the old voucher. Balances are computed from the journal. Purchase: Dr 1400 / Cr 2010. Payment: Dr 2010 / Cr bank, cash, capital or loan. Costs and contributed land debit 1400. See `docs/DECISIONS.md` for validation, permissions and void rules.

`npm run seed:demo` adds the Baloch Heights example idempotently, including enough bank funding for its instalments. `npm run test:postgres` verifies land rules inside rolled-back transactions. Screenshots and measured layout checks are in `docs/land-evidence`.

## Sales Version 1

Apply migration `024_sales.sql` using `node --env-file=.env.local --import tsx server/src/migrate.ts` before starting this version. Migrations 001-023 remain unchanged. Only administrators write sales; financial reads require ledger access.

Before handover, payments debit Cash/Bank and credit Client Advances (2200). Handover posts one balanced entry: debit received advances and unpaid receivables, credit the full sale price to Revenue (4000). Later payments clear receivables (1100). Cancellation before handover clears advances into a refund and/or Other Income (4100). Corrections reverse and repost in one transaction. Customer advances never count as partner contributions.

Status is computed from journal-backed receipts and planned due dates: Available, Booked below 25% received, Sold, Fully paid, and Handed over. Overdue means an unpaid scheduled amount whose due date has passed. Optional payment allocations take priority; other money applies oldest first. No balances are persisted. Project locks and version checks protect writes; deferred triggers enforce schedule totals. Runtime UPDATE/DELETE on sales tables is revoked; guarded functions manage changes.

The Sales tab includes unit generation, customer creation, full/instalment/custom plans, receipts, cancellation and handover. Overview uses existing data and an eight-item setup checklist. Ctrl+K searches projects, units, customers, partners and entries subject to permissions. The global Add menu opens common actions. Grids provide filtered totals, ExcelJS exports, print, column tools, clipboard range editing and undo. Feasibility/Building retain their existing editors with a shared Review, filter and export view.

Routes: `/api/projects/:id/sales` plus `/generate-units`, `/units`, `/units/:recordId`, `/units/:recordId/deactivate`, `/units/bulk-price`, `/agreements`, `/agreements/:recordId`, `/agreements/:recordId/cancel`, `/agreements/:recordId/handover`, `/agreements/:recordId/handover/void`, `/payments`, `/payments/:recordId`, `/payments/:recordId/void`, and `/payments/:recordId/receipt`. Shared contacts use `/api/parties`; search uses `/api/search?q=`; cross-project drill-down uses `/api/ledger`.

`npm run seed:demo` generates units and four idempotent sales scenarios in Baloch Heights, using real postings and checking the advances/receivables/revenue reconciliation. Use an intended demo database. `npm run test:postgres` includes `scripts/testSalesPostgres.ts` and rolls back its verification records. Screenshot evidence stays outside Git in `var/sales-evidence/`.

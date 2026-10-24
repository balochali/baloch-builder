# Accounting rewrite plan

## Scope and review gates

Work on `accounting-rewrite`, created from the existing `dev` checkout. Preserve the pre-existing uncommitted sales lifecycle changes; do not include those changes in rewrite commits. Stop for review after each phase. This document precedes implementation.

## Keep, rewrite, remove

- Keep all `src/data/repositories/*`, `src-tauri/migrations/001_init.sql` through `024_phased_sale_refunds.sql`, and Rust/Tauri code until the Phase 6 importer reconciles historical data. Existing SQLite amounts are whole rupees; import must multiply by 100 using exact integers.
- Keep the legacy `src/` application runnable and tested while the new application is built in `apps/web`. New web navigation will contain only grids, with no legacy dashboards.
- Port the intent of `src/domain/money.ts` to `packages/shared/src/money.ts`, replacing number/whole-rupee arithmetic with bigint paisa and string JSON transport. Leave legacy helpers compatible with the existing database.
- Reuse field semantics and validation ideas from `src/features/sheet/sheetParsing.ts`, `SheetGrid.tsx`, `ProjectWorkbook.tsx` and sheet tabs; rebuild the grid base with AG Grid Community.
- Replace local authentication and `src/data/client.ts` with Fastify, Argon2 passwords, server-side sessions, PostgreSQL and Drizzle. Permissions are enforced at server boundaries and project access is checked on each applicable operation.
- Delete only the explicitly unwanted `payment-redesign.mjs` and `payment-tests-update.mjs` now. Document removals in `CHANGES.md`. Retire desktop UI, SQLite repositories and Rust Drive backup only after Phase 6.

## Existing-to-new module mapping

- `projectsRepository.ts`, `projectStageRepository.ts`, projects pages → server projects/assignments and web Projects grid (Phase 1).
- `domain/money.ts`, `domain/types.ts`, validation schemas → shared money, schemas and permissions (Phase 1 onward).
- `data/audit.ts` → append-only PostgreSQL audit log and admin audit grid (Phase 1).
- `projectFinanceRepository.ts`, `domain/balances.ts`, profit/loss panels → journal, Trial Balance (Phase 1), financial reports (Phase 6).
- `bankRepository.ts`, payment forms → bank controls and approval workflow (Phase 2).
- `projectPartnersRepository.ts`, `partnerFundingRepository.ts`, `projectPayoutsRepository.ts` → partner subledger (Phase 3).
- `landSalesRepository.ts`, `projectContractorsRepository.ts`, construction/land sheets → land, supplier and contractor subledgers (Phase 4).
- `projectBuildingRepository.ts`, `projectSalesRepository.ts`, `salePaymentsRepository.ts`, `saleEventsRepository.ts`, sales sheets → units, sales, schedules, receipts and handover (Phase 5).
- `documentsRepository.ts`, attachments domain → voucher attachment metadata/files; migrate old attachments in Phase 6.
- `sheetRecordsRepository.ts`, `projectSheetRepository.ts` → grid adapters, saved views and exports.
- `resetRepository.ts`, personal/udhaar repositories → explicit Phase 6 import mappings or unmapped-record findings; never silently discard records.

## Phase 1 implementation

1. Establish npm workspaces, shared contracts, server/web builds, Compose, ordered migrations and backup/restore documentation.
2. Add users, sessions, optional privileged-user TOTP, admin bootstrap, roles and project assignments.
3. Add chart of accounts, periods, vouchers/lines, transactional numbering and audit triggers. Database rules reject unbalanced posting, posted edits/deletion and locked-period writes. Until Phase 2, reject payment posting altogether (including journals crediting cash/bank), so approval cannot be bypassed.
4. Build grid navigation for projects, users, assignments, accounts, periods, vouchers/lines, journal, audit/settings and Trial Balance. All money passes as exact decimal strings in paisa.
5. Add database integration and API permission tests, including negative cases and migration-from-empty checks. Repair existing type/lint/test failures without dropping coverage.
6. Run root typecheck, lint, tests, server tests and production builds; report actual execution results and remaining limitations. Make focused commits and stop for review.

## Later review gates

- Phase 2: full approval state machine, banking, reconciliation and payment reversals.
- Phase 3: partners, capital/loans, allocation, payout and statements.
- Phase 4: land/construction, retention/advances and costs.
- Phase 5: sales, unit allocation, handover and aging.
- Phase 6: remaining reports, complete exports, SQLite dry-run/import/reconciliation, then desktop retirement.

## Verification and deployment

Use PostgreSQL integration tests for triggers and concurrent transactions, not SQLite substitutes. Keep legacy tests in the root suite. CI migrates an empty PostgreSQL instance. Deploy behind HTTPS on a VPS, use persistent database/attachment volumes, schedule nightly pg_dump backups and exercise restore into a separate database. Record defaults and outstanding work in DECISIONS.md and CHANGES.md.

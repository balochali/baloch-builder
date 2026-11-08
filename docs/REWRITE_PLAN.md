# Accounting rewrite plan — revised design lock

## Scope and review gates

Work on `accounting-rewrite`, created from the existing `dev` checkout. Preserve the pre-existing uncommitted sales lifecycle changes; do not include those changes in rewrite commits. Stop for review after each phase. This document precedes implementation.

## Protected design files (revised brief)

The local main and origin/main references both point to c486a95 (initial Tauri scaffold), which contains no login or sidebar. The existing developed app is on dev, the source of accounting-rewrite. Preserve that existing design rather than replacing it with the scaffold; literal visual comparison to main's nonexistent login/sidebar cannot be claimed. No main files or references will be changed.

Protected files:
- src/features/auth/AuthPage.tsx — existing login markup, wording, logo, layout. Only inject the server authentication callback; retain legacy invoke fallback for the optional desktop client.
- src/features/auth/auth-page.css and src/assets/auth/residential-towers.png — unchanged.
- src/app/layout/Sidebar.tsx — preserve markup/classes/behaviour; only add accounting items and filter menu items by server role.
- src/app/layout/sidebar.css and src/assets/building-elevation.svg — unchanged.
- src/app/layout/AppShell.tsx — preserve shell markup, mobile navigation, theme controls and layout; only pass role/menu information and route labels.
- src/app/providers.tsx, src/stores/themeStore.ts, src/main.tsx — preserve theme application and stylesheet order.
- src/styles/globals.css, workspace-redesign.css, workspace-ui.css, charts.css, builder-identity.css, modern-workspace.css — unchanged shared tokens/fonts/base styles.
- src/components/ui/* and src/lib/utils.ts — unchanged shared base components.

Before/after verification: record protected asset/style hashes and compare rendered login/sidebar using the same browser viewport and theme when browser approval is available. Browser checks were blocked by the automatic approval service's usage limit before the revised brief; do not claim visual parity without running comparison. Source verification is supplementary, not a replacement for the visual check.

## Keep, rewrite, remove

- Keep all `src/data/repositories/*`, `src-tauri/migrations/001_init.sql` through `024_phased_sale_refunds.sql`, and Rust/Tauri code until the Phase 6 importer reconciles historical data. Existing SQLite amounts are whole rupees; import must multiply by 100 using exact integers.
- Keep the frontend in src/ and its existing shell. Mount accounting grids in its working area. Retain legacy feature/repository files and optional desktop mode until Phase 6, but do not expose unfinished legacy data screens as server accounting screens.
- Port the intent of `src/domain/money.ts` to `shared/src/money.ts`, replacing number/whole-rupee arithmetic with bigint paisa and string JSON transport. Leave legacy helpers compatible with the existing database.
- Reuse field semantics and validation ideas from `src/features/sheet/sheetParsing.ts`, `SheetGrid.tsx`, `ProjectWorkbook.tsx` and sheet tabs; rebuild the grid base with AG Grid Community.
- Replace local authentication and `src/data/client.ts` with Fastify, Argon2 passwords, server-side sessions, PostgreSQL and Drizzle. Permissions are enforced at server boundaries and project access is checked on each applicable operation.
- Delete only the explicitly unwanted `payment-redesign.mjs` and `payment-tests-update.mjs` now. Document removals in `CHANGES.md`. Keep the Tauri shell as an optional client. Retire only the Rust Drive backup after Phase 6 importer verification; do not remove SQLite repositories before then.

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

1. Establish server/ and shared/ packages beside the retained src/ frontend, shared contracts, server/frontend builds, Compose, ordered migrations and backup/restore documentation.
2. Add users, sessions, optional privileged-user TOTP, admin bootstrap, roles and project assignments.
3. Add chart of accounts, periods, vouchers/lines, transactional numbering and audit triggers. Database rules reject unbalanced posting, posted edits/deletion and locked-period writes. Until Phase 2, reject payment posting altogether (including journals crediting cash/bank), so approval cannot be bypassed.
4. Use the protected login and sidebar with role-aware server routes; build working-area grids for projects, users, assignments, accounts, periods, vouchers/lines, journal, audit/settings and Trial Balance. All money passes as exact decimal strings in paisa.
5. Add database integration and API permission tests, including negative cases and migration-from-empty checks. Repair existing type/lint/test failures without dropping coverage.
6. Run root typecheck, lint, tests, server tests and production builds; report actual execution results and remaining limitations. Make focused commits and stop for review.

## Later review gates

- Phase 2: full approval state machine, banking, reconciliation and payment reversals.
- Phase 3: partners, capital/loans, allocation, payout and statements.
- Phase 4: land/construction, retention/advances and costs.
- Phase 5: sales, unit allocation, handover and aging.
- Phase 6: remaining reports, complete exports, SQLite dry-run/import/reconciliation, then Rust Drive backup retirement while retaining the Tauri shell.

## Verification and deployment

Use PostgreSQL integration tests for triggers and concurrent transactions, not SQLite substitutes. Keep legacy tests in the root suite. CI migrates an empty PostgreSQL instance. Deploy behind HTTPS on a VPS, use persistent database/attachment volumes, schedule nightly pg_dump backups and exercise restore into a separate database. Record defaults and outstanding work in DECISIONS.md and CHANGES.md.

## Revised grid acceptance criteria

Voucher and journal grids have pinned Total Debit, Total Credit and Difference rows. Difference updates on edit and multi-row paste; Save and Post are disabled while invalid or unbalanced. Blank add rows remain at the bottom. Scope all new CSS to the accounting working area so login/sidebar/theme cannot be restyled. No standalone replacement login, header or navigation is retained.

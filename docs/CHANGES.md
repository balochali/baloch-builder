# Change inventory

Commit `c1b423f` ("going to make it like peachtree") changed 82 files and mixed the three groups below. This inventory records that history without rewriting it. The sales work had already been in progress and was not intended to be treated as part of the accounting rewrite. Each of the 82 paths appears once below, including the two deleted temporary scripts.

## 1. Accounting rewrite (Phase 1)

The server and shared workspaces introduce PostgreSQL accounting, authentication/roles, exact money contracts, audit, and balanced immutable posting. The accounting working area adds editable grids; deployment, backup/restore, design baselines, and tests support Phase 1. Existing ledger/payment approval restrictions remain; this stabilization task adds no Phase 2 features.

- `.dockerignore`
- `.github/workflows/accounting.yml`
- `.gitignore`
- `Dockerfile`
- `README.md`
- `docker-compose.yml`
- `docs/DECISIONS.md`
- `docs/DESIGN_LOCK.json`
- `docs/REWRITE_PLAN.md`
- `docs/phase1-evidence/login-after.png`
- `docs/phase1-evidence/login-before-standards.png`
- `docs/phase1-evidence/login-before.png`
- `docs/phase1-evidence/sidebar-before.png`
- `package-lock.json`
- `package.json`
- `payment-redesign.mjs`
- `payment-tests-update.mjs`
- `scripts/backup.mjs`
- `scripts/baloch-backup.service`
- `scripts/baloch-backup.timer`
- `scripts/restore.mjs`
- `server/migrations/001_foundation.sql`
- `server/migrations/002_attachment_guards.sql`
- `server/migrations/003_correction_links.sql`
- `server/package.json`
- `server/src/app.ts`
- `server/src/db.ts`
- `server/src/index.ts`
- `server/src/migrate.ts`
- `server/src/schema.ts`
- `server/src/seed.ts`
- `server/test/foundation.test.ts`
- `server/tsconfig.json`
- `server/vitest.config.ts`
- `shared/package.json`
- `shared/src/core.test.ts`
- `shared/src/index.ts`
- `shared/src/money.ts`
- `shared/tsconfig.json`
- `shared/vitest.config.ts`
- `src/data/api.ts`
- `src/data/repositories/projectSheetRepository.ts`
- `src/data/session.ts`
- `src/features/accounting/AccountingPage.tsx`
- `src/features/accounting/Grid.tsx`
- `src/features/accounting/PasswordEditor.tsx`
- `src/features/accounting/VoucherEditor.tsx`
- `src/features/accounting/accounting.css`
- `src/features/accounting/voucherGrid.ts`
- `src/test/data/designLock.test.ts`
- `src/test/data/projectPartnersRepository.test.ts`
- `src/test/features/AccountingGrid.test.ts`
- `src/test/features/AppShell.test.tsx`
- `src/test/features/AuthPage.test.tsx`
- `src/test/features/landSalesRepository.test.ts`
- `vite.config.ts`

The two payment-*.mjs files were deleted temporary development scripts. projectSheetRepository.ts contained an incidental caught-error/cause lint repair. projectPartnersRepository.test.ts and landSalesRepository.test.ts updated stale expectations/migration setup for the existing legacy model; they did not migrate business data. AuthPage/AppShell tests verified preserved presentation and role wiring. The old login-before.png used a quirks-mode harness; login-before-standards.png is the valid comparison with login-after.png. No new browser comparison is claimed by Task 1.

## 2. Wiring changes to protected files

- `src/features/auth/AuthPage.tsx`: Added an optional server authentication callback and conditional TOTP field; retained the existing login presentation and wording.
- `src/app/layout/Sidebar.tsx`: Filtered existing navigation groups by the server user role, using the existing markup and styles.
- `src/app/layout/AppShell.tsx`: Passed the role to desktop/mobile navigation and recognized accounting route labels.
- `src/app/router.tsx`: Selected the server session/API flow by default and retained the original shell around accounting routes.
- `src/app/LegacyRouter.tsx`: Preserved the prior offline/Tauri routing and authentication path for legacy mode.

Task 1 keeps AuthPage.tsx, Sidebar.tsx, AppShell.tsx and LegacyRouter.tsx unchanged. Only the authorized router/API wiring changes for expired sessions. The user explicitly selected an expiry message beside the unchanged login page rather than modifying its internal error line. DESIGN_LOCK.json is not edited.

## 3. Earlier sales-lifecycle work that was already in progress

These changes belong to the earlier SQLite/Tauri sales lifecycle, refunds, documents, related dashboards, styling and tests. They are not part of the accounting rewrite. Task 9 will rebuild sales on the new ledger. Until then they remain in the retained legacy client; this task does not remove them or claim they post into PostgreSQL.

- `src-tauri/migrations/023_sale_lifecycle.sql`
- `src-tauri/migrations/024_phased_sale_refunds.sql`
- `src-tauri/src/lib.rs`
- `src/data/repositories/bankRepository.ts`
- `src/data/repositories/saleEventsRepository.ts`
- `src/data/repositories/salePaymentsRepository.ts`
- `src/features/projects/components/ProjectDashboard.tsx`
- `src/features/projects/components/ProjectProfitLossPanel.tsx`
- `src/features/projects/components/ProjectSalesPanel.tsx`
- `src/features/projects/components/SaleDocumentsDialog.tsx`
- `src/features/projects/components/SaleLifecycleDialog.tsx`
- `src/features/projects/components/SalePaymentDialog.tsx`
- `src/features/projects/components/SalePaymentForm.tsx`
- `src/features/projects/components/SaleRefundDialog.tsx`
- `src/features/projects/components/project-sales.css`
- `src/features/projects/pages/ProjectDetailPage.tsx`
- `src/features/projects/pages/project-partners.css`
- `src/test/data/salePaymentsRepository.test.ts`
- `src/test/features/ProjectDetailPage.test.tsx`
- `src/test/features/ProjectSalesPanel.test.tsx`
- `src/test/features/SaleLifecycleDialog.test.tsx`

ProjectDetailPage.tsx and its tests also included small verification/lint corrections alongside that earlier work; the file as a whole must not be attributed to the accounting rewrite.

## Task 1 stabilization

Work starts from accounting-rewrite at c1b423f on task-1-stabilize. A fetch confirmed origin/main at e3a29ba; local main remains at its old c486a95 position. Neither main nor dev was switched, reset or committed to. No history was rewritten.

1. Correctly type loaded voucher grid rows before appending blank entries.
2. Separate baloch_owner migrations/restores from limited baloch_app runtime access, provision roles repeatably, define default privileges, enforce runtime identity, and test permission denials. Backup uses the app role; restore uses the owner.
3. Add explicit proxy trust, independent IP/email and IP login budgets, dummy Argon2 verification, and protection against unauthenticated audit flooding.
4. Return expired/deactivated sessions to the existing login page, handle empty/non-JSON responses, and remove expired database sessions at startup/login.
5. Use a non-root multi-stage Node 24 container with writable attachments and healthcheck; move tsx into runtime dependencies and replace the old workflow with ci.yml.
6. Document the original mixed commit, current decisions and verification evidence without changing accounting scope.

Final verification is recorded in docs/STABILIZATION_RESULTS.md.

## Task 2

Branch task-2-project-profile starts at task-1-stabilize (ef3d6ec), because Task 1 was not merged into accounting-rewrite at the initial fetch. No protected branch or prior commit was rewritten.

1. Migration 006, shared project schemas and server project routes add profile fields, exact areas, buildings, archive controls, guarded status transitions and append-only history.
2. Migration 007 and assignment routes validate active users, enforce immediate assignment revocation and expose the Assigned users grid.
3. Migration 008, cost-head routes/shared schemas and repeatable reference seeding add audited cost tags and the 15 requested defaults.
4. Migration 009, account/voucher mappings, searchable grid editor and cost-tag validation require valid WIP tags at database posting time. Existing posting fixtures now carry tags; all prior assertions remain.
5. Migration 010, shared area helpers, project list/workspace/status/building grids and Cost heads grid add the working-area screens. Grid paste honors cell editability. Router gains project detail/cost-head routes; Sidebar changes only its role-aware item list.
6. Router-only fixed expiry banner and regression assertions preserve the existing login DOM.
7. PostgreSQL, shared and frontend tests cover the role matrix, assignments, status/history, archive/code locks, exact areas, seed preservation, cost tags, database privileges, audit values, grid export, profile editing and navigation.
8. README and decisions/results document operation, verification and limitations.

No Task 3 work or payment approval functionality is included. See TASK_2_RESULTS.md for measured results.

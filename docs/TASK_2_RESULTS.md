# Task 2 verification results

Date: 2026-10-25 (Asia/Karachi). Branch: task-2-project-profile, based on Task 1 commit ef3d6ec. Task 1 had not been merged into accounting-rewrite at the initial fetch. No main/dev/accounting-rewrite/task-1-stabilize commits were changed, and nothing was force-pushed.

## Environment and method

- Windows / PowerShell, isolated Node 24.22.1 runtime under ignored .test-tmp/stabilization-tools; npm 10.9.2.
- Native PostgreSQL 18 on localhost port 55433. Integration tests reset only the dedicated baloch_test schema. Migrations run as baloch_owner; application/API and direct runtime SQL run as baloch_app.
- TEMP and TMP point to the ignored workspace .test-tmp directory for frontend tests.
- All original tests/assertions are retained. Existing WIP posting fixtures now include Materials; project fixtures supply required type/city.
- Raw local logs are in ignored .test-tmp/task2-*.log. Summary below records the measured outcomes; logs are not production artifacts or committed credentials.

## Commands and measured results

- npm run typecheck: passed for root, server and shared (exit 0).
- npm run lint: passed with zero warnings (exit 0).
- npm run build: passed (exit 0); Vite build completed in 41.86 seconds. Vite reports large-chunk and plugin-timing warnings; generated bundles include AG Grid, ExcelJS and the retained legacy client. No bundle-size optimization is claimed.
- npm run test:legacy: final isolated retry passed, 76 files / 331 tests (previously 74 files / 317 tests), 209.43 seconds, exit 0. The unchanged legacy timeout did not recur.
- npm run test:server: 1 file, 70 tests passed (previously 41), 44.91 seconds.
- npm run test -w @baloch/shared: 2 files, 27 tests passed (previously 4), 1.05 seconds.
- npx vitest run src/test/features/ProjectAccounting.test.tsx src/test/features/ProjectGridExport.test.tsx src/test/data/designLock.test.ts: 3 files, 14 tests passed in the initial focused run. One additional voucher-posting-control test was then added and is included in the full root totals.
- SessionExpiry focused regression: 2 tests passed.
- designLock passed in the focused and full runs. git diff against task-1-stabilize shows no changes to docs/DESIGN_LOCK.json, migrations 001–005, AuthPage, AppShell, LegacyRouter or shared/protected style files. Sidebar has exactly one added item-list line.
- Fresh database seed-twice identity and edited-head preservation: both passed within the PostgreSQL suite.
- git diff --check: passed.

## Specific evidence

- All four roles exercise create/profile/archive permissions. Sales and Construction assignment removal denies detail, buildings, assignments and status-history reads on the next request, and removes the project from list results.
- Every WIP account (1200/1210/1220/1230/1240) permits an incomplete draft, rejects untagged posting through API and direct app-role SQL, and posts with a valid tag. Existing payment and cash-credit blockers remain covered by the retained tests.
- Forward/backward/closed status rules are checked via API and direct SQL; history is immutable to app UPDATE/DELETE and to ordinary owner UPDATE/DELETE. App DDL/TRUNCATE is denied for all three new tables.
- Audit assertions compare old/new project, building, cost-head and assignment values. A temporary future-unit foreign key proves referenced buildings cannot be removed.
- Fresh setup runs all migrations twice, seeds once, captures complete users/accounts/settings/cost_heads/audit_log rows, seeds again and compares the complete snapshots. They are identical. A separate test renames/deactivates a seeded head and changes its unused code, then verifies another seed preserves every row and does not duplicate that seed key.
- Shared tests cover all status pairs, exact decimal comparisons, calendar/date ordering, plot-area validation, regional marla sizes, kanal conversion, round trips and decimal values beyond JavaScript number precision.
- Frontend tests cover added-project validation/conversion, filtered/sorted Excel export, every role's profile editability, unchanged rounded display values, backward reasons, searchable cost tags/default-account prefilling, required-tag posting controls and role-aware menu entries.
- The expiry regression compares the actual login DOM before/after expiry and asserts a fixed-position alert. AuthPage is unchanged.

## Verification attempts and limitations

- The first new database suite run passed 69/70: one new audit test referenced a nonexistent timestamp column. Correcting that test query produced 70/70.
- An initial typecheck caught an incomplete AG Grid callback fixture cast in a new frontend test. It was corrected without any, ts-ignore or disabled lint rules.
- The first full frontend run passed 330/331 (75/76 files): the unchanged legacy ProjectDetailPage partner-funding test exceeded its existing 15-second limit during overlapping verification. No tests were skipped or timeouts increased. The isolated full retry passed all 331 tests with the existing 15-second limit unchanged; its result is recorded above.
- Docker containers, a VPS deployment, a packaged Tauri build and an interactive browser walkthrough were not run for Task 2. Native PostgreSQL and automated DOM/grid tests are the verification evidence; they do not constitute a visual browser walkthrough.
- No production database was migrated. Existing profiles receive other / Unspecified placeholders and require Admin review. Invalid or case-duplicate existing project codes stop migration rather than being silently rewritten.
- Historical posted WIP entries without tags are preserved. An exact reversal of such an entry currently conflicts with mandatory-tag posting; a reviewed legacy correction policy is still needed. A deactivated historical head must be reactivated before being selected on a new reversing draft.
- Areas store exact decimal square feet. Nonterminating display conversions round to 12 decimal places; unchanged cells preserve the original value. Explicit edits store the exact conversion of the entered decimal.
- Units and all ten future project tabs remain unimplemented and disabled. The building-reference test uses a temporary fixture, not a Units implementation. Closed remains reserved for Task 10. No Task 3 or payment approval work was started.
- Work is committed locally; no push, PR, merge or deployment is claimed.

## Commit structure

Eight focused commits cover the eight numbered task items: project schema/routes, assignments, cost heads/seed, voucher tagging, screens/area units, expiry banner, tests, and documentation. No Task 3 changes are included.

# Task 1 stabilization verification

Verified on 25 October 2026 on branch `task-1-stabilize`, starting from `accounting-rewrite` at `c1b423f`. The final checks used an isolated Node **24.22.1** runtime, npm **10.9.2**, and a dedicated native PostgreSQL **18** cluster bound to localhost port 55433. The machine's default Node 22 was used for earlier checks; the complete final run was repeated on Node 24 to match CI and the Docker major version.

## Final results

- `npm run typecheck`: exit 0; root, server and shared TypeScript checks passed with no errors.
- `npm run lint`: exit 0; zero errors/warnings under `--max-warnings 0`.
- `npm test`: exit 0, no skipped or deleted tests. Root: **74 files, 317 tests passed** (previously 72/308). Server: **1 file, 41 tests passed** (previously 23 tests). Shared: **1 file, 4 tests passed**. Total: **76 files, 362 tests**.
- `npm run test:server`: independently passed 41 tests against PostgreSQL after the session changes; the final Node 24 `npm test` repeated the same server suite successfully.
- `npm run build`: exit 0; Vite built 2,470 modules. It still reports large bundle warnings; changing bundle architecture is outside this stabilization task.
- The existing `designLock` test passes in the full suite and in a focused run. `docs/DESIGN_LOCK.json` is byte-for-byte unchanged in Git. AuthPage, Sidebar, AppShell, LegacyRouter, theme/styles and shared UI files are unchanged by this task.
- Focused session/API/design tests: **3 files, 10 tests passed**. The component test uses the real router, login, shell and API client, mocking only the unrelated accounting page; it verifies logout-on-401 and successful re-login.
- CI YAML parsed successfully. Assertions checked both requested branch filters, Node 24, PostgreSQL 18/baloch_test, separate owner/app connection identities, and all eight expected setup/check commands. The root, shared and server scripts in CI are the same scripts run locally, with the final full run invoking them through `npm test`.
- `docker compose config --quiet`: exit 0 with sample environment values. Both fresh-instance and existing administrator configuration are documented.

## Database and authentication evidence

The application, seed and business operations in the integration suite connect as `baloch_app`; only schema setup/migrations and explicit trigger-defense checks use `baloch_owner`. All 23 earlier integration cases remain. Delete/attachment mutation assertions now require permission-denied SQLSTATE 42501 where grants reject the action before triggers execute; the original audit trigger checks still run independently as owner.

Eight added privilege cases verify seven forbidden runtime operations (business TRUNCATE, audit UPDATE/DELETE, disabling triggers, DROP TABLE, CREATE ROLE and CREATE TABLE) plus the privileges on a table created by a future owner migration. Denial probes run inside transactions and roll back even if a regression incorrectly permits them. The future table test actually inserts, updates and selects data as the app, and checks that DELETE/TRUNCATE are absent.

Seven login-hardening cases cover configuration validation, independent trusted clients/emails, ignored spoofed headers with trust off or an untrusted peer, the separate thirty-attempt IP budget, dummy-hash verification with a generous timing ratio, and audit-flood/oversized-email defenses. Three session cases cover startup cleanup, expiry rejection/login cleanup with live-session preservation, and rejection after deactivation.

Role provisioning ran twice successfully against the disposable database, demonstrating repeatability. A custom-format database backup succeeded using the limited app role. Restore succeeded into a different, empty, pre-provisioned database using the owner role. These checks validate credential separation and database restoration; they are not a production recovery rehearsal with real attachments or business reconciliation.

## Limits and deliberate exclusions

- `docker compose build` was attempted and failed to connect to Docker Desktop's Linux engine (`dockerDesktopLinuxEngine` pipe missing). The image build, non-root volume behavior and container healthcheck are **not runtime-verified** here. The Dockerfile and Compose changes are prepared for review, not described as a tested container deployment.
- No new browser walkthrough or visual screenshot was taken. Protected source/assets remain unchanged and component/design-lock tests pass. The expiry message appears beside the unchanged login page, as explicitly selected by the user.
- The GitHub Actions workflow was validated locally but not executed on a hosted runner; no PR, push or deployment is claimed.
- Tauri packaging was not run; its retained sources and prior sales lifecycle were not changed.
- npm reports 11 dependency audit findings (6 moderate, 5 high), the same reported totals before this task. Broad dependency upgrades were not attempted because this task specifies six focused fixes and forbids unrelated feature work. Moving tsx to runtime dependencies and resolving its lockfile is included.
- No Phase 2 accounting features, payment approval, sales rebuild, legacy-data import or history rewrite were performed. The existing payment-posting block remains.

## Review artifacts

`docs/CHANGES.md` inventories all 82 files from c1b423f in the three requested categories. `docs/DECISIONS.md` records database ownership, proxy trust, session handling and deployment choices. Six focused commits correspond to the six numbered items. The work remains on task-1-stabilize for review; main and dev were not modified.

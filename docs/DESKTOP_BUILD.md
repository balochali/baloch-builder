# Building the Windows desktop installer

Build on Windows x64 with Node 22.23.5+, npm, Rust stable (MSVC target), and Visual Studio C++ build tools. These are build-machine requirements only. The installed application needs none of them.

```
npm ci
npm run desktop:build
```

The output is `src-tauri/target/release/bundle/nsis/Baloch Builder_<version>_x64-setup.exe`. The workflow `desktop-build.yml` also builds on manual dispatch and `v*` tags, and uploads the installer plus `runtimes.json`. Keep the package, Tauri and Cargo versions synchronized before tagging.

Pinned payloads: PostgreSQL 18.7-1 (major 18, matching integration tests) and Node 22.23.5 LTS, Windows x64. `scripts/fetch-runtimes.mjs` verifies SHA-256 before extraction. The pins come from the publisher manifests at https://get.enterprisedb.com/postgresql/postgresql-18.7-1-windows-x64-binaries.zip.sha256 and https://nodejs.org/dist/v22.23.5/SHASUMS256.txt. Archives cache under ignored `var/runtime-downloads`; extracted resources are ignored under `src-tauri/resources`. Never commit runtimes or secrets.

`desktop:prepare` builds Vite, bundles the API/maintenance entry with esbuild, and copies Argon2's Windows native prebuild and its loader dependencies. The Visual Studio build tools supply their licensed x64 CRT DLLs for app-local deployment beside PostgreSQL, Node and the shell; no system-wide VC installation is performed. Rust runs bundled node.exe as its managed sidecar; no global Node, npm, service, PATH modification, firewall exception or PostgreSQL installation is needed. The NSIS current-user installer embeds the WebView2 offline installer. Updates replace application resources, not user data. Uninstall keeps user data.

## Data layout and lifecycle

```
%LOCALAPPDATA%\BalochBuilder\
  postgres-data\        PostgreSQL 18 cluster
  attachments\          Uploaded files
  backups\              baloch-YYYYMMDD-HHMMSS[-suffix].dump
  logs\                 desktop.log and four rotated files (5 MB each)
  config\
    secrets.json        Per-install random credentials and TOTP key
    data-version.json   Highest successfully opened application version
```

The data directory has inheritance removed and access granted only to the current Windows SID. `secrets.json` contains plaintext credentials protected by that user-only ACL; keep the entire protected data folder in device backups. PostgreSQL uses SCRAM, binds only 127.0.0.1 and prefers 54329. The API binds only 127.0.0.1 and prefers 3217; occupied ports cause selection of free loopback ports. Runtime queries use baloch_app; migrations use baloch_owner. Credentials travel to the sidecar over stdin, never on command lines. The packaged HTTP origin uses an HttpOnly SameSite=Strict session cookie; Secure remains enabled for other production deployments.

On first launch, create the company and administrator. There are no default passwords. Setup is serialized by a database advisory lock and closes once a user exists. The setup and login write routes require the same CSRF header and are rate-limited.

Rust owns a Windows kill-on-close Job Object containing the suspended-then-assigned runtime processes. Normal close stops the API before pg_ctl fast shutdown. Forced shell termination kills its descendants; PostgreSQL replays WAL on reopening. A PID file is removed only when Windows proves its PID no longer exists. A live or inaccessible PID is refused rather than killed. Failed initialization never overwrites a nonempty cluster.

Before pending migrations, a custom-format pg_dump is validated and retained. The first launch each UTC day also backs up and retains the newest 14 dumps. Settings > About and data exposes backup, status, folder and redacted diagnostics to administrators. Restore accepts only a listed local dump, requires RESTORE, makes a safety backup, restores into a candidate database, validates it and swaps databases. Failure restores the previous database. Candidate/previous databases left by a crash are preserved and block another restore for deliberate recovery. Attachments accompany backups in `.dump.files`; metadata accompanies them in `.dump.json`. Restores are intended for this installation; encrypted TOTP secrets require its original secrets.json.

The launcher refuses a data-version newer than its own. Do not edit migrations 001–024. Add numbered migrations for future schema work. `seed:demo` refuses installed/production data; use only a separate development database.

## Development

`npm run tauri:dev` continues using `scripts/start-desktop-dev.mjs`, `.env.local`, Vite and pre-installed PostgreSQL. Debug builds do not provision installed data. Run typecheck, lint, npm test, npm run test:postgres (against a disposable database), npm run test:desktop and cargo test --manifest-path src-tauri/Cargo.toml.

## Recovery and reset

First close the app and copy the full data folder elsewhere. Logs never intentionally include credentials. If secrets.json is lost, restore it with the cluster from a protected backup; do not initialize over an existing cluster. An incomplete first-run cluster should be preserved for inspection before reset. A restore interrupted during the database rename may leave baloch_previous; preserve both databases and use bundled PostgreSQL tools to recover the previous database before retrying.

To erase ALL installed records and start again: close the app, verify there are no remaining processes using the folder, then deliberately delete `%LOCALAPPDATA%\BalochBuilder`. This is destructive and also removes backups and any legacy development data stored beneath that folder. Prefer copying the folder to an offline backup first. Uninstall alone does not reset data.

## Signing later

Unsigned builds require no secrets and Windows SmartScreen may warn about an unrecognized publisher. For distribution, obtain a code-signing certificate, configure Tauri's Windows signing settings in a protected CI environment, timestamp signatures, and sign both executable and installer. The workflow contains commented signing placeholders; never put private keys in source control. See https://v2.tauri.app/distribute/windows-installer/ for current installer and WebView2 options.

A local build is not proof of clean-machine compatibility. Run DESKTOP_TEST_CHECKLIST.md on clean Windows 10 and Windows 11 x64 VMs, including offline installation, non-admin accounts, missing VC runtimes, and WebView2 provisioning before release.

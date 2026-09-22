# Baloch Builder

A desktop application for a property developer and builder to keep land,
project, partner and payment records in one organized, searchable system —
instead of scattered notebooks, phone notes and Excel files.

Built with **Tauri 2 + React + TypeScript**, storing all data locally in a
single **SQLite** database. It works fully offline.

This repository currently contains **Version 1 (Acquire & Invest)** in
progress: the application shell, database foundation, and the Contacts
module as a proof of the full stack.

## Prerequisites

- [Node.js](https://nodejs.org/) LTS
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- Windows: [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  and [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)
  (WebView2 ships with Windows 10/11 by default on most machines)

## Getting started

```bash
npm install
npm run tauri:dev
```

This opens the actual desktop application window. Use `npm run dev` only if
you want to preview the React UI in a plain browser — Tauri-only features
(the database, file system access) will not work there.

## Scripts

| Command                | What it does                                     |
| ----------------------- | ------------------------------------------------- |
| `npm run tauri:dev`     | Run the desktop app in development mode           |
| `npm run dev`           | Run just the Vite dev server (browser, no Tauri)  |
| `npm run tauri:build`   | Build the installable Windows application         |
| `npm run test`          | Run the test suite once                           |
| `npm run test:watch`    | Run tests in watch mode                           |
| `npm run lint`          | Lint the `src` folder                             |
| `npm run format`        | Format the codebase with Prettier                 |
| `npm run typecheck`     | Type-check without emitting output                |

Before committing, `npm run typecheck`, `npm run lint` and `npm run test`
should all pass with no errors.

## Where the data lives

On first run, the app creates a SQLite database file and an `attachments`
folder inside the OS app-data directory for this app
(identifier `com.baloch-pc.baloch-builder`):

- **Windows:** `%APPDATA%\com.baloch-pc.baloch-builder\`
- **macOS:** `~/Library/Application Support/com.baloch-pc.baloch-builder/`
- **Linux:** `~/.local/share/com.baloch-pc.baloch-builder/`

Inside that folder:

- `baloch-builder.db` — the single SQLite database (all records)
- `attachments/` — receipts, photos and documents attached to records

Copying those two items is a full backup of the business data. (Automatic
scheduled backups are not implemented yet — see `docs/decisions.md`.)

## Project structure and architecture

See [`docs/architecture.md`](./docs/architecture.md) for the layering rules
(`features → domain + data`), the database conventions, and why certain
choices were made. See [`docs/decisions.md`](./docs/decisions.md) for a
running log of specific decisions.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) +
  [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) +
  [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
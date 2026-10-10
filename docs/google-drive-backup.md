# Google Drive backup: setup, behaviour and restore

Baloch Builder can back up all of its data to the owner's own Google Drive, either by hand
(**Settings → Backup to Google Drive → Back up now**) or automatically (daily or weekly).

## What a backup contains

One zip file, uploaded to a Drive folder called **Baloch Builder Backups**:

| Entry | What it is |
| --- | --- |
| `baloch-builder.db` | A consistent copy of the database, made with SQLite's `VACUUM INTO` and checked with `PRAGMA integrity_check` before it is uploaded. The live database is never copied file-by-file, because it runs in WAL mode. |
| `attachments/…` | Every receipt, photo and PDF from the attachments folder. |
| `manifest.json` | App version, creation time, attachment count and the database's SHA-256. |

The login file (`account.json`) is **not** included, so the password hash never leaves the
computer. After a restore you keep signing in with the password already on that computer.

File names look like `Baloch-Builder-backup-2026-10-10_09-30-00.zip`. After each upload the app deletes
backups beyond the number to keep (default 10, adjustable from 5 to 30). It only ever deletes files
whose name starts with `Baloch-Builder-backup-` inside its own folder.

## One-time Google setup (about 10 minutes)

Each installation uses a Google "OAuth client" created in the owner's own Google Cloud project, so
no secret is stored in this repository.

1. Open <https://console.cloud.google.com> with the Gmail account that should receive the backups and create a project (for example "Baloch Builder").
2. **APIs & Services → Library**: search for **Google Drive API** and click **Enable**.
3. **OAuth consent screen** (now called *Google Auth Platform*): choose **External**, enter an app name and your email, and add the scope `https://www.googleapis.com/auth/drive.file`.
4. **Publish the app** so its status is **In production**.
   While an External app stays in *Testing*, Google expires its refresh tokens after **7 days**, which
   would silently stop automatic backups. `drive.file` is a non-sensitive scope, so publishing does
   not require Google's verification review.
5. **Credentials → Create credentials → OAuth client ID → Application type: Desktop app.** Copy the *Client ID* and *Client secret*.
6. In the app: **Settings → Backup to Google Drive**, paste both values, press **Save credentials**, then **Connect Google Drive** and approve access in the browser.

The app requests only `drive.file` (plus the account email, to show which account is connected). With
that scope it can see **only files it created itself**, never the rest of the Drive.

Google's menu names change from time to time; the steps stay the same.

## Where secrets are kept

| Secret | Location |
| --- | --- |
| Client secret and refresh token | The operating system's credential store (Windows Credential Manager / macOS Keychain). |
| Client ID, schedule, last-backup result | `backup-settings.json` in the app's local data folder (no secrets). |

Disconnecting asks Google to revoke the token and deletes it from the credential store. Backups already
in Drive are left untouched.

## Automatic backups

* They run **while the app is open**. A background check runs one minute after start-up and then every 30 minutes.
* If the app was closed when a backup came due, it runs shortly after the app is next opened.
* After a failed attempt (for example no internet) the app waits an hour before trying again.
* If Google no longer honours the saved sign-in, the app marks Google Drive as disconnected and the Settings page asks you to reconnect.
* Two backups can never run at the same time.

## Restoring from a backup

There is no one-click restore yet. To restore by hand:

1. Download the chosen `Baloch-Builder-backup-….zip` from the **Baloch Builder Backups** folder in Google Drive and unzip it.
2. **Close Baloch Builder completely.**
3. Open the folders shown under **Settings → Current settings** (*Database file* and *Attachments folder*).
4. Make a safety copy of the current `baloch-builder.db` (and delete any `baloch-builder.db-wal` and `baloch-builder.db-shm` next to it), then replace it with the `baloch-builder.db` from the zip.
5. Replace the contents of the attachments folder with the zip's `attachments` folder.
6. Start the app and sign in with your existing password.

## Notes for developers

* Rust code: `src-tauri/src/commands/backup/` (`oauth.rs` sign-in with PKCE and loopback redirect, `drive.rs` resumable upload, `snapshot.rs`, `archive.rs`, `settings.rs`, `secrets.rs`, `mod.rs` Tauri commands and the scheduler) and `src-tauri/src/commands/account_store.rs` (profile and password change).
* Uploads use Google's resumable protocol in 8 MiB chunks and resume after an interrupted chunk.
* The unit tests include a fake Google server (chunked upload, resume after a 503, quota and expired-token messages) and a live WAL database snapshot test. Run them with `cargo test` in `src-tauri`.
* The frontend listens for the `backup-finished` event so the Settings page updates when an automatic backup completes.
# Clean Windows VM acceptance checklist

Use fresh, non-admin Windows 10 and Windows 11 x64 snapshots with no Node, PostgreSQL, developer tools, or VC runtime installed. Repeat offline. Record app version, Windows build, installer size/hash and evidence for each item. Local development-machine results do not replace these checks.

- [ ] Install unsigned per-user NSIS package; no elevation; shortcuts work; WebView2 provisions offline.
- [ ] First launch shows splash, then welcome/setup; no firewall prompt.
- [ ] Create company and administrator with confirmed 12+ character password; auto-login succeeds.
- [ ] A second setup request returns 409; missing CSRF header is rejected; excessive attempts are limited.
- [ ] Create a project, partner and land payment; verify ledger values.
- [ ] Generate/sell a unit, receive payment and print receipt.
- [ ] Open a second app instance; only the existing window remains.
- [ ] Close; no node.exe or postgres.exe belonging to this installation remains.
- [ ] Reopen; account, project, payments and receipt persist.
- [ ] Kill the shell in Task Manager; children stop; reopen and crash recovery completes.
- [ ] Occupy 54329 and 3217 with other listeners; app chooses free ports without disturbing them.
- [ ] Settings shows version, data folder, database status, last backup and backup list; Open folder works.
- [ ] Back up now, change data, type RESTORE and restore; earlier data returns; safety backup exists; re-login works.
- [ ] Corrupt a copy of a dump and attempt restore; current data and safety backup survive.
- [ ] Simulate failure during restore and recover preserved baloch_previous; do not drop it blindly.
- [ ] First launch next UTC day makes a backup; after 15 days only newest 14 retained; unrelated files remain.
- [ ] Upgrade over prior installer; pending migrations cause backup first; all existing data survives.
- [ ] Try older executable with newer data-version marker; clear refusal, no data modification.
- [ ] Inspect config ACL from another standard user; secrets unreadable. No default/shared passwords.
- [ ] Check listeners are 127.0.0.1 only; verify no inbound firewall exception was added.
- [ ] Force startup error; error screen displays log path; Copy diagnostics contains no secrets.
- [ ] Exercise enough logging to rotate; total five 5 MB log files, credentials absent.
- [ ] Uninstall; AppData, backups and records remain; reinstall can reopen them.

Sign and repeat installation/upgrade checks before a public release. SmartScreen reputation for unsigned builds is expected to differ from signed builds.

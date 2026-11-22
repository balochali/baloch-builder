import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { api } from "@/data/api";
type Status = {
  version: string;
  dataFolder: string;
  database: string;
  logPath: string;
  backups: { name: string; size: number }[];
};
export function DesktopData() {
  const [status, setStatus] = useState<Status>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(""),
    [confirm, setConfirm] = useState("");
  useEffect(() => {
    if (!isTauri()) return;
    let live = true;
    void api<{ token: string }>("desktop-authorize", "POST", {})
      .then(({ token }) => invoke<Status>("desktop_data", { action: "status", token }))
      .then((value) => {
        if (live) setStatus(value);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, []);
  async function run(action: string) {
    setBusy(true);
    setError("");
    try {
      const { token } = await api<{ token: string }>("desktop-authorize", "POST", {});
      const result = await invoke("desktop_data", {
        action,
        token,
        name: selected,
        confirmation: confirm,
      });
      if (action === "diagnostics")
        await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      if (action === "restore") {
        window.location.reload();
        return;
      }
      setStatus(await invoke<Status>("desktop_data", { action: "status", token }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  if (!isTauri()) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-5 mt-5">
      <h2 className="text-xl font-semibold">About and data</h2>
      <p>Your backups and records are stored on this computer.</p>
      <button disabled={busy} onClick={() => void run("status")}>
        Refresh data status
      </button>
      {status && (
        <>
          <p>Version: {status.version}</p>
          <p>Data folder: {status.dataFolder}</p>
          <p>Database: {status.database}</p>
          <p>Last backup: {status.backups[0]?.name ?? "No backups yet"}</p>
          <div className="flex flex-wrap gap-3 my-3">
            <button disabled={busy} onClick={() => void run("open")}>
              Open folder
            </button>
            <button disabled={busy} onClick={() => void run("backup")}>
              Back up now
            </button>
            <button disabled={busy} onClick={() => void run("diagnostics")}>
              Copy diagnostics
            </button>
          </div>
          <label className="block">
            Backup to restore
            <select
              className="block border bg-background p-2"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Choose a backup</option>
              {status.backups.map((b) => (
                <option key={b.name}>{b.name}</option>
              ))}
            </select>
          </label>
          <p>
            Restoring replaces the current records. A safety backup is saved first. You will sign in
            again afterwards.
          </p>
          <label>
            Type RESTORE
            <input
              className="block border bg-background p-2"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !selected || confirm !== "RESTORE"}
            onClick={() => void run("restore")}
          >
            Restore backup
          </button>
        </>
      )}
      {busy && <p role="status">Working… please keep this window open.</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

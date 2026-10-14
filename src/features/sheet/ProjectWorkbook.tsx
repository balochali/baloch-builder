import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Save, Table2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { attachmentAccept } from "@/domain/attachments";
import { SheetGrid, emptyRow, rowIsBlank, type SheetRow } from "./SheetGrid";
import { describeError } from "./sheetParsing";
import { projectSheets, type ProjectSheet } from "./projectSheets";
import "./sheet.css";

interface DraftRow extends SheetRow {
  savedId?: string;
  baseline?: Record<string, string>;
}
const pending = new Map<string, Promise<void>>();
const changed = (r: DraftRow) =>
  r.savedId ? JSON.stringify(r.cells) !== JSON.stringify(r.baseline) : !rowIsBlank(r);
function persist(key: string, rows: DraftRow[]) {
  // Checkpoint each committed row, even when the user leaves the project mid-save.
  const draft = rows.filter(changed);
  if (draft.length) localStorage.setItem(key, JSON.stringify(draft));
  else localStorage.removeItem(key);
}
function restore(key: string): DraftRow[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(
      (r): r is DraftRow =>
        r &&
        typeof r.id === "string" &&
        r.cells &&
        Object.values(r.cells).every((v) => typeof v === "string") &&
        (!r.savedId || typeof r.savedId === "string"),
    );
  } catch {
    return [];
  }
}

export function ProjectWorkbook({
  projectId,
  onSaved,
  onBusy,
}: {
  projectId: string;
  onSaved: () => void;
  onBusy?: (busy: boolean) => void;
}) {
  const sheets = useMemo(() => projectSheets(projectId), [projectId]);
  const [selected, setSelected] = useState("project");
  const [busy, setBusy] = useState(false);
  const sheet = sheets.find((s) => s.id === selected) ?? sheets[0];
  return (
    <section className="project-workbook sheet-page" aria-label="Project workbook">
      <div className="workbook-heading">
        <span className="workbook-icon">
          <Table2 size={24} />
        </span>
        <div>
          <h2>Project sheet view</h2>
          <p>
            Your project records, together in one workbook. Edit a cell or add a row, then save
            changes.
          </p>
        </div>
      </div>
      <div className="workbook-tabs" role="tablist" aria-label="Project worksheets">
        {sheets.map((s) => (
          <button
            type="button"
            role="tab"
            id={`worksheet-tab-${s.id}`}
            aria-controls="worksheet-panel"
            aria-selected={s.id === sheet.id}
            disabled={busy}
            key={s.id}
            onClick={() => setSelected(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <WorkbookEditor
        key={`${projectId}:${sheet.id}`}
        sheet={sheet}
        storageKey={`bb-project-sheet-v1:${projectId}:${sheet.id}`}
        onSaved={onSaved}
        onBusy={(value) => {
          setBusy(value);
          onBusy?.(value);
        }}
      />
    </section>
  );
}

export function WorkbookEditor({
  sheet,
  storageKey,
  onSaved,
  onBusy,
}: {
  sheet: ProjectSheet;
  storageKey: string;
  onSaved: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  const active = useRef(true);
  const lock = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    setLoaded(false);
    setError("");
    async function load() {
      await pending.get(storageKey);
      const saved = await sheet.load();
      if (!live) return;
      const drafts = restore(storageKey);
      const merged: DraftRow[] = saved.map((r) => {
        const draft = drafts.find((d) => d.savedId === r.id);
        if (!draft) return { ...r, savedId: r.id, baseline: r.cells };
        // Do not silently overwrite records changed elsewhere since the draft was made.
        const conflict =
          draft.baseline &&
          sheet.columns.some(
            (c) => !c.readOnly && (draft.baseline?.[c.key] ?? "") !== (r.cells[c.key] ?? ""),
          );
        return {
          ...draft,
          error: conflict
            ? "This record changed elsewhere. Discard the draft and reload before editing."
            : draft.error,
        };
      });
      for (const d of drafts)
        if (!d.savedId || !saved.some((r) => r.id === d.savedId))
          merged.push(
            d.savedId
              ? { ...d, error: "This record no longer exists. Discard the draft and reload." }
              : d,
          );
      if (!sheet.readOnly && sheet.allowAdd !== false && (!sheet.singleton || !merged.length))
        merged.push(...Array.from({ length: sheet.singleton ? 1 : 3 }, emptyRow));
      setRows(merged);
      setLoaded(true);
    }
    void load().catch((e) => {
      if (live) setError(describeError(e));
    });
    return () => {
      live = false;
    };
  }, [sheet, storageKey, reload]);

  function edit(next: SheetRow[]) {
    const merged = next.map((r) => ({ ...rows.find((old) => old.id === r.id), ...r }));
    setRows(merged);
    setMessage("");
    try {
      persist(storageKey, merged);
      setError("");
    } catch {
      setError("Draft storage is unavailable. Keep this sheet open until changes are saved.");
    }
  }

  async function save() {
    if (lock.current || pending.has(storageKey)) return;
    lock.current = true;
    setSaving(true);
    onBusy(true);
    setMessage("");
    setError("");
    const working = rows.map((r) => ({ ...r }));
    const task = async () => {
      let count = 0;
      for (let i = 0; i < working.length; i++) {
        const r = working[i];
        if (!changed(r)) continue;
        try {
          if (r.savedId) {
            const latest = (await sheet.load()).find((item) => item.id === r.savedId);
            if (
              !latest ||
              sheet.columns.some(
                (c) => !c.readOnly && (r.baseline?.[c.key] ?? "") !== (latest.cells[c.key] ?? ""),
              )
            )
              throw new Error(
                "This record changed elsewhere. Discard the draft and reload before editing.",
              );
          }
          const id = await sheet.save(r.cells, r.savedId);
          working[i] = { ...r, savedId: id, baseline: { ...r.cells }, error: undefined };
          count++;
        } catch (e) {
          working[i] = { ...r, error: describeError(e) };
        }
        try {
          persist(storageKey, working);
        } catch {
          if (active.current)
            setError("Could not update the saved draft on this device. Keep this sheet open.");
        }
        if (active.current) setRows([...working]);
      }
      // Refresh calculated fields and normalized values without discarding failed edits.
      try {
        const fresh = await sheet.load();
        for (let i = 0; i < working.length; i++) {
          const r = working[i];
          if (r.savedId && !changed(r)) {
            const latest = fresh.find((s) => s.id === r.savedId);
            if (latest)
              working[i] = { ...latest, id: r.id, savedId: latest.id, baseline: latest.cells };
          }
        }
      } catch {
        if (active.current)
          setError("Changes saved, but refreshed totals could not be loaded. Reopen the sheet.");
      }
      if (active.current) {
        setRows([...working]);
        const failed = working.filter((r) => r.error).length;
        setMessage(
          `${count} row${count === 1 ? "" : "s"} saved.${failed ? ` ${failed} row(s) need attention; correct them and save again.` : " All changes are up to date."}`,
        );
        if (count) onSaved();
      }
    };
    const promise = task();
    pending.set(storageKey, promise);
    try {
      await promise;
    } finally {
      pending.delete(storageKey);
      lock.current = false;
      if (active.current) {
        setSaving(false);
        onBusy(false);
      }
    }
  }

  function exportCsv() {
    const escape = (text: string) =>
      `"${(/^[=+@-]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
    const csv = [
      sheet.columns.map((c) => escape(c.label)).join(","),
      ...rows
        .filter((r) => !rowIsBlank(r))
        .map((r) => sheet.columns.map((c) => escape(r.cells[c.key] ?? "")).join(",")),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sheet.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const dirty = rows.filter(changed).length;
  return (
    <div
      id="worksheet-panel"
      role="tabpanel"
      aria-labelledby={`worksheet-tab-${sheet.id}`}
      className="sheet-panel"
    >
      <div className="sheet-panel-head">
        <div>
          <h3>{sheet.label}</h3>
          <p>{sheet.help}</p>
        </div>
        <div className="sheet-actions">
          {sheet.upload && (
            <label className="workbook-upload">
              Attach file
              <input
                aria-label="Attach project document"
                type="file"
                accept={attachmentAccept(true)}
                disabled={!loaded || saving || !!dirty}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file || !sheet.upload) return;
                  setSaving(true);
                  onBusy(true);
                  setError("");
                  void sheet
                    .upload(file)
                    .then(() => {
                      if (active.current) {
                        setReload((v) => v + 1);
                        onSaved();
                      }
                    })
                    .catch((e) => {
                      if (active.current) setError(describeError(e));
                    })
                    .finally(() => {
                      if (active.current) {
                        setSaving(false);
                        onBusy(false);
                      }
                    });
                }}
              />
            </label>
          )}
          <Button variant="outline" disabled={!loaded || saving} onClick={exportCsv}>
            <Download size={15} /> Export CSV
          </Button>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => {
              if (
                dirty &&
                !window.confirm(
                  "Discard the unsaved changes in this worksheet and reload saved records?",
                )
              )
                return;
              localStorage.removeItem(storageKey);
              setReload((v) => v + 1);
              setMessage("");
            }}
          >
            <RotateCcw size={15} /> {dirty ? "Discard changes" : "Reload"}
          </Button>
          {!sheet.readOnly && (
            <Button disabled={!loaded || saving || !dirty} onClick={() => void save()}>
              <Save size={15} /> {saving ? "Saving…" : `Save changes${dirty ? ` (${dirty})` : ""}`}
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p className="sheet-message is-bad" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="sheet-message" role="status">
          {message}
        </p>
      )}
      {!loaded ? (
        <p role="status">{error ? "Use Reload to try again." : "Loading project records…"}</p>
      ) : (
        <>
          <p className="workbook-record-count">
            {rows.filter((r) => r.savedId).length} saved records
            {dirty ? ` · ${dirty} unsaved row(s)` : ""}
            {sheet.readOnly ? " · Read only" : " · Drafts are kept on this device"}
          </p>
          <SheetGrid
            name={`project-${sheet.id}`}
            columns={sheet.columns.map((c) => (sheet.readOnly ? { ...c, readOnly: true } : c))}
            rows={rows}
            onRows={edit}
            disabled={saving}
            allowAdd={!sheet.singleton && !sheet.readOnly && sheet.allowAdd !== false}
            onOpen={
              sheet.open
                ? (r) => {
                    void sheet.open?.(r.cells).catch((e) => setError(describeError(e)));
                  }
                : undefined
            }
            canDelete={(r) =>
              !rows.find((old) => old.id === r.id)?.savedId && !sheet.readOnly && !sheet.singleton
            }
          />
          {!sheet.readOnly && (
            <p className="sheet-tip">
              Paste cells from Excel · Enter moves down · Saved records stay in the sheet · Grey
              cells are calculated or managed by the project workflow · Totals exclude invalid
              amounts
            </p>
          )}
        </>
      )}
    </div>
  );
}

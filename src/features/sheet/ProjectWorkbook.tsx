import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Save,
  Table2,
  RotateCcw,
  Building2,
  Users,
  Wallet,
  Files,
  ChevronRight,
  CircleCheck,
  PencilLine,
  LockKeyhole,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { attachmentAccept } from "@/domain/attachments";
import { SheetGrid, emptyRow, rowIsBlank, type SheetRow } from "./SheetGrid";
import { describeError, tidyCell } from "./sheetParsing";
import { projectSheets, type ProjectSheet } from "./projectSheets";
import "./sheet.css";

interface DraftRow extends SheetRow {
  savedId?: string;
  baseline?: Record<string, string>;
}
const pending = new Map<string, Promise<void>>();
function normalizeRows(sheet: ProjectSheet, records: SheetRow[]) {
  return records.map((r) => ({
    ...r,
    cells: {
      ...r.cells,
      ...Object.fromEntries(
        sheet.columns
          .filter((c) => c.kind === "date")
          .map((c) => [c.key, tidyCell("date", r.cells[c.key] ?? "")]),
      ),
    },
  }));
}
const worksheetGroups = [
  {
    label: "Project & building",
    icon: Building2,
    ids: ["summary", "project", "land", "building", "floors"],
  },
  { label: "Partners & funding", icon: Users, ids: ["partners", "contributions", "payouts"] },
  {
    label: "Costs & sales",
    icon: Wallet,
    ids: ["estimates", "construction_cost", "project_cost", "sales", "land_sales"],
  },
  { label: "Project files", icon: Files, ids: ["documents"] },
];
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
          <span className="workbook-eyebrow">YOUR PROJECT WORKBOOK</span>
          <h2>Every project detail, in one place</h2>
          <p>
            View saved records, make corrections and add new entries. Your normal project pages stay
            in sync.
          </p>
        </div>
        <span className="workbook-heading-badge">
          <Table2 size={15} /> Sheet view
        </span>
      </div>
      <div className="workbook-guide">
        <span>
          <b>1</b> Choose a worksheet
        </span>
        <ChevronRight size={14} />
        <span>
          <b>2</b> Edit cells or add rows
        </span>
        <ChevronRight size={14} />
        <span>
          <b>3</b> Save your changes
        </span>
      </div>
      <div className="workbook-layout">
        <div
          className="workbook-tabs"
          role="tablist"
          aria-label="Project worksheets"
          aria-orientation="vertical"
        >
          <span className="workbook-nav-caption">WORKSHEETS</span>
          {worksheetGroups.map(({ label, icon: Icon, ids }) => (
            <div className="workbook-tab-group" key={label}>
              <p>
                <Icon size={14} />
                {label}
              </p>
              {ids
                .map((id) => sheets.find((s) => s.id === id)!)
                .map((s) => (
                  <button
                    type="button"
                    role="tab"
                    id={`worksheet-tab-${s.id}`}
                    aria-controls="worksheet-panel"
                    aria-selected={s.id === sheet.id}
                    disabled={busy}
                    key={s.id}
                    tabIndex={s.id === sheet.id ? 0 : -1}
                    onClick={() => setSelected(s.id)}
                    onKeyDown={(event) => {
                      const index = sheets.findIndex((item) => item.id === s.id);
                      const next =
                        event.key === "ArrowDown" || event.key === "ArrowRight"
                          ? (index + 1) % sheets.length
                          : event.key === "ArrowUp" || event.key === "ArrowLeft"
                            ? (index + sheets.length - 1) % sheets.length
                            : event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? sheets.length - 1
                                : -1;
                      if (next >= 0) {
                        event.preventDefault();
                        setSelected(sheets[next].id);
                        document.getElementById(`worksheet-tab-${sheets[next].id}`)?.focus();
                      }
                    }}
                  >
                    <span>{s.label}</span>
                    {s.id === sheet.id && <ChevronRight size={14} />}
                  </button>
                ))}
            </div>
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
      </div>
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
    async function load() {
      await pending.get(storageKey);
      if (!live) return;
      setLoaded(false);
      setError("");
      const saved = normalizeRows(sheet, await sheet.load());
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
            const latest = normalizeRows(sheet, await sheet.load()).find(
              (item) => item.id === r.savedId,
            );
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
        const fresh = normalizeRows(sheet, await sheet.load());
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
  async function deleteRow(r: DraftRow) {
    if (lock.current || pending.has(storageKey)) return;
    if (!r.savedId) {
      const left = rows.filter((x) => x.id !== r.id);
      edit(left.length ? left : [emptyRow()]);
      return;
    }
    if (!sheet.remove) return;
    const label =
      sheet.columns
        .slice(0, 3)
        .map((c) => r.cells[c.key])
        .filter(Boolean)
        .join(" · ") || "this row";
    if (
      !window.confirm(
        `Delete "${label}"?\n\nIt will be removed from the software and you cannot get it back.`,
      )
    )
      return;
    lock.current = true;
    setSaving(true);
    onBusy(true);
    setError("");
    setMessage("");
    const task = async () => {
      try {
        await sheet.remove!(r.savedId!);
        const left = rows.filter((x) => x.id !== r.id);
        try {
          persist(storageKey, left);
        } catch {
          /* draft storage unavailable */
        }
        if (active.current) {
          setReload((v) => v + 1);
          setMessage("Deleted.");
        }
        if (active.current) onSaved();
      } catch (e) {
        if (active.current) setError(describeError(e));
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
            <RotateCcw size={15} /> {dirty ? "Undo my changes" : "Refresh"}
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
        <p role="status">{error ? "Use Refresh to try again." : "Loading records…"}</p>
      ) : (
        <>
          <div className="workbook-record-bar">
            <span className="workbook-record-count">
              <Table2 size={14} />
              {rows.filter((r) => r.savedId).length} {sheet.readOnly ? "" : "saved "}
              {rows.filter((r) => r.savedId).length === 1 ? "record" : "records"}
            </span>
            {dirty ? (
              <span className="workbook-dirty">
                <PencilLine size={14} />
                {dirty} row(s) with unsaved changes
              </span>
            ) : (
              <span className="workbook-saved">
                <CircleCheck size={14} />
                {sheet.readOnly ? "Calculated from saved records" : "Up to date"}
              </span>
            )}
            <span className="workbook-cell-legend">
              {sheet.readOnly ? (
                <>
                  <LockKeyhole size={13} /> Read only
                </>
              ) : (
                <>
                  <i /> Plain cells are editable <i className="is-locked" /> Shaded cells are read
                  only
                </>
              )}
            </span>
          </div>
          <SheetGrid
            name={`project-${sheet.id}`}
            columns={sheet.columns.map((c) => (sheet.readOnly ? { ...c, readOnly: true } : c))}
            rows={rows}
            onRows={edit}
            disabled={saving}
            rowStatus={(r) => {
              const entry = rows.find((old) => old.id === r.id);
              return entry?.savedId
                ? changed(entry)
                  ? "Edited"
                  : "Saved"
                : rowIsBlank(r)
                  ? ""
                  : "New";
            }}
            allowAdd={!sheet.singleton && !sheet.readOnly && sheet.allowAdd !== false}
            onOpen={
              sheet.open
                ? (r) => {
                    void sheet.open?.(r.cells).catch((e) => setError(describeError(e)));
                  }
                : undefined
            }
            onDelete={(r) => void deleteRow(r as DraftRow)}
            canDelete={(r) =>
              !sheet.readOnly &&
              !sheet.singleton &&
              (!rows.find((old) => old.id === r.id)?.savedId || !!sheet.remove)
            }
          />
          {sheet.readOnly && rows.length === 0 && (
            <p className="workbook-empty">
              No {sheet.label.toLowerCase()} recorded for this project yet.
            </p>
          )}
          {!sheet.readOnly && (
            <ol className="sheet-howto">
              <li>Click any box and type to change it. Press Enter to go down.</li>
              <li>
                Click <strong>Save changes</strong> when you are done.
              </li>
              <li>
                {sheet.remove ? (
                  <>
                    Click <strong>Delete</strong> next to the row number to remove it.
                  </>
                ) : (
                  <>Grey boxes are filled in by the software and cannot be typed in.</>
                )}
              </li>
            </ol>
          )}
        </>
      )}
    </div>
  );
}

import { Trash2 } from "lucide-react";
import type { ICellRendererParams } from "ag-grid-community";
import { useEstimateColumns } from "./EstimateColumns";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  blankWorkbookRow,
  workbookData,
  workbookFields,
  workbookSchemas,
  type WorkbookSheet,
} from "@baloch/shared";
import type { SessionUser } from "@/data/session";
import { api } from "@/data/api";
import { Grid, type GridEditHandle, type Row } from "./Grid";
import { entryError } from "./sheetMessages";
import { RegisterSummary } from "./RegisterSummary";
import { EstimateOverview } from "./EstimateOverview";
import { SalesEstimate } from "./SalesEstimate";

export function ProjectRegister({
  projectId,
  sheet,
  user,
  archived = false,
  sales = false,
  marlaSqft = "272.25",
  onDirty,
}: {
  projectId: string;
  sheet: WorkbookSheet;
  user: SessionUser;
  archived?: boolean;
  sales?: boolean;
  marlaSqft?: string;
  onDirty: (dirty: boolean) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const sheetElement = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (sheet !== "estimate") return;
    const element = sheetElement.current;
    if (!element) return;
    const resize = () => {
      // Use the unscrolled position so page scrolling cannot make the sheet grow.
      let top = element.getBoundingClientRect().top;
      let bottomSpace = 12;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        top += parent.scrollTop;
        const style = getComputedStyle(parent);
        bottomSpace +=
          (parseFloat(style.paddingBottom) || 0) +
          (parseFloat(style.borderBottomWidth) || 0) +
          (parseFloat(style.marginBottom) || 0);
      }
      element.style.setProperty(
        "--estimate-height",
        `${Math.max(220, window.innerHeight - top - bottomSpace)}px`,
      );
    };
    resize();
    window.addEventListener("resize", resize);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    const workspace = element.closest(".project-workbook");
    if (workspace) observer?.observe(workspace);
    return () => {
      window.removeEventListener("resize", resize);
      observer?.disconnect();
    };
  }, [sheet]);
  const [removed, setRemoved] = useState<Row[]>([]);
  const [estimateTab, setEstimateTab] = useState("Cost");
  const [salesEditing, setSalesEditing] = useState(false),
    [salesDirty, setSalesDirty] = useState(false);
  const gridEdit = useRef<GridEditHandle>(null);
  const [original, setOriginal] = useState<Row[]>([]);
  const canEdit = user.role === "admin" && !archived;
  const [editing, setEditing] = useState(false);
  const editable = canEdit && (sheet !== "estimate" || editing);
  const estimateColumns = useEstimateColumns(projectId, editable && !busy, rows);
  useEffect(() => {
    let active = true;
    api<Row[]>(`projects/${projectId}/workbook/${sheet}`)
      .then((data) => {
        if (active) {
          setOriginal(structuredClone(data));
          setRows(
            canEdit
              ? [...data, { ...blankWorkbookRow(sheet), _new: true, _placeholder: true }]
              : data,
          );
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [projectId, sheet, canEdit]);
  const blank = () => ({ ...blankWorkbookRow(sheet), _new: true, _placeholder: true });
  const changed = (row: Row) =>
    row._new
      ? !row._placeholder
      : JSON.stringify(workbookData(sheet, row)) !==
        JSON.stringify(workbookData(sheet, original.find((r) => r.id === row.id) ?? {}));
  const dirty = removed.length > 0 || rows.some(changed);
  useEffect(() => {
    onDirty(dirty || salesDirty);
  }, [dirty, salesDirty, onDirty]);
  const normalizeRows = (values: Row[]): Row[] =>
    values.map((row) => ({
      ...row,
      _placeholder:
        Boolean(row._new) &&
        JSON.stringify(workbookData(sheet, row)) === JSON.stringify(blankWorkbookRow(sheet)),
    }));
  async function save() {
    // Commit the active editor before taking the save snapshot; React state may still be batched.
    const current = normalizeRows(gridEdit.current?.commit() ?? rows);
    setBusy(true);
    setError("");
    const next: Row[] = [];
    let failed = false;
    const pendingRemoval: Row[] = [];
    for (const row of removed) {
      try {
        await api(`projects/${projectId}/workbook/estimate/${row.id}`, "DELETE", {
          version: row.version,
        });
        setOriginal((previous) => previous.filter((r) => r.id !== row.id));
      } catch {
        failed = true;
        pendingRemoval.push(row);
      }
    }
    setRemoved(pendingRemoval);
    for (const row of current.filter((r) => !r._placeholder)) {
      if (!changed(row)) {
        next.push(row);
        continue;
      }
      try {
        const data = workbookSchemas[sheet].parse(workbookData(sheet, row));
        const path = `projects/${projectId}/workbook/${sheet}`;
        const saved = await api<Row>(
          row._new ? path : path + "/" + row.id,
          row._new ? "POST" : "PATCH",
          row._new ? data : { version: row.version, data },
        );
        setOriginal((previous) => [...previous.filter((r) => r.id !== saved.id), saved]);
        next.push(saved);
      } catch (e) {
        failed = true;
        next.push({ ...row, error: entryError(e) });
      }
    }
    setRows([...next, blank()]);
    setBusy(false);
    if (!failed && sheet === "estimate") setEditing(false);
    if (failed)
      setError(
        pendingRemoval.length
          ? "Some rows could not be removed. Your other changes are saved. Try Save again; if the row changed, reopen the sheet to reload it."
          : "Some rows could not be saved. Correct the highlighted entries; your other rows are saved.",
      );
  }
  function removeRow(row: Row) {
    if (!editable || busy) return;
    const current = normalizeRows(gridEdit.current?.commit() ?? rows);
    const index = row.id ? current.findIndex((r) => r.id === row.id) : Number(row._rowIndex);
    const target = current[index];
    if (!target || target._placeholder) return;
    if (!target._new) setRemoved((previous) => [...previous, target]);
    const next = current.filter((_, i) => i !== index);
    if (!next[next.length - 1]?._placeholder) next.push(blank());
    setRows(next);
  }
  return (
    <section
      ref={sheetElement}
      className={`project-register${sheet === "estimate" ? " estimate-viewport" : ""}`}
    >
      <div
        hidden={sheet === "estimate" && estimateTab !== "Cost"}
        className="register-sheet-content"
      >
        {sheet !== "estimate" && (
          <p className="sheet-hint">
            {sales
              ? "Sales and flat availability use the same records. Mark a flat Sold and enter its buyer, price and receipts."
              : "Enter records in the last row, then Save Changes. Double-click a cell to edit."}{" "}
            Amounts are in PKR. Register amounts do not post accounting vouchers.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {dirty && sheet !== "estimate" && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const data = await api<Row[]>(`projects/${projectId}/workbook/${sheet}`);
                setOriginal(structuredClone(data));
                setRows([...data, blank()]);
                setError("");
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Discard edits and reload saved rows
          </button>
        )}
        {sheet === "estimate" && loaded && (
          <div
            className="sheet-toolbar estimate-actions"
            role="toolbar"
            aria-label="Estimate actions"
          >
            <button
              className="estimate-edit"
              disabled={!canEdit || editing || busy}
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            <button
              className="estimate-save"
              disabled={!editable || busy}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        )}
        {!loaded ? (
          <p role="status">
            {error ? "Unable to load this sheet. Reopen the tab to retry." : "Loading sheet…"}
          </p>
        ) : (
          <Grid
            editHandle={gridEdit}
            emptyMessage={
              sheet === "estimate" ? "No estimates yet. Click Edit to add records." : undefined
            }
            screen={`project-${sheet}-${projectId}`}
            rows={sheet === "estimate" && !editing ? rows.filter((row) => !row._placeholder) : rows}
            toolbar={sheet !== "estimate"}
            singleClickEdit={sheet === "estimate" && editing}
            newLabel={
              editable
                ? {
                    partners: "Partner",
                    construction: "Work Item",
                    estimate: "Estimate Item",
                    flats: "Flat",
                    sales_estimate: "Unit Type",
                  }[sheet]
                : undefined
            }
            onSave={editable && dirty ? () => void save() : undefined}
            busy={busy}
            showSearch={sheet !== "estimate"}
            toolbarContent={sheet === "estimate" ? estimateColumns.controls : undefined}
            columns={
              sheet === "estimate"
                ? [
                    ...estimateColumns.columns,
                    ...(editable
                      ? [
                          {
                            colId: "remove",
                            headerName: "",
                            width: 48,
                            minWidth: 48,
                            maxWidth: 48,
                            flex: 0,
                            editable: false,
                            sortable: false,
                            filter: false,
                            resizable: false,
                            cellRenderer: (p: ICellRendererParams<Row>) =>
                              p.data && !p.data._placeholder ? (
                                <button
                                  type="button"
                                  className="estimate-delete"
                                  aria-label={`Delete ${p.data.item || "row"}`}
                                  title="Delete row"
                                  disabled={busy}
                                  onClick={() => removeRow(p.data!)}
                                >
                                  <Trash2 size={17} aria-hidden="true" />
                                </button>
                              ) : null,
                          },
                        ]
                      : []),
                  ]
                : [
                    ...workbookFields[sheet].map((f) => ({
                      field: f.key,
                      headerName: f.label,
                      hide: sales
                        ? ["floor", "rooms", "area", "seller", "notes"].includes(f.key)
                        : f.hidden,
                      editable: editable && !busy,
                      minWidth: f.key === "name" || f.key === "item" ? 150 : 85,
                      ...(f.options
                        ? {
                            cellEditor: "agSelectCellEditor",
                            cellEditorParams: { values: f.options },
                          }
                        : {}),
                    })),
                  ]
            }
            onChange={
              editable && !busy
                ? (values) => {
                    const next = normalizeRows(values);
                    if (!next[next.length - 1]?._placeholder) next.push(blank());
                    setRows(next);
                  }
                : undefined
            }
            summary={(visible) => <RegisterSummary sheet={sheet} rows={visible} />}
          />
        )}
      </div>
      {sheet === "estimate" && (
        <>
          {estimateTab === "Overview" && (
            <EstimateOverview projectId={projectId} marlaSqft={marlaSqft} />
          )}
          {estimateTab === "Sales" && (
            <SalesEstimate
              projectId={projectId}
              canEdit={canEdit}
              marlaSqft={marlaSqft}
              onEditingChange={setSalesEditing}
              onDirty={setSalesDirty}
            />
          )}
          <div className="estimate-bottom-tabs" role="tablist" aria-label="Estimate sheets">
            {["Overview", "Cost", "Sales"].map((name) => (
              <button
                key={name}
                role="tab"
                aria-selected={estimateTab === name}
                disabled={editing || salesEditing || busy}
                onClick={() => setEstimateTab(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

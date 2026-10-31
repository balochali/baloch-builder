import { Trash2 } from "lucide-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { useEffect, useRef, useState } from "react";
import {
  blankWorkbookRow,
  formatPKR,
  salesEstimateTotals,
  sumAreas,
  workbookData,
  workbookSchemas,
} from "@baloch/shared";
import { api } from "@/data/api";
import { Grid, type GridEditHandle, type Row } from "./Grid";
import { entryError } from "./sheetMessages";

const sheet = "sales_estimate" as const;
const quickTypes = ["Shop", "2 Room Flat", "3 Room Flat"];
function formatNumber(value: unknown) {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return text;
  const [whole, fraction] = text.split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? "." + fraction : "");
}
const plain = (paisa: bigint) => formatPKR(paisa).replace(/^Rs\s?/, "");
const compact = (paisa: bigint) =>
  paisa % 100n === 0n ? formatNumber(String(paisa / 100n)) : plain(paisa);
const blank = () => ({ ...blankWorkbookRow(sheet), _new: true, _placeholder: true });
const fromServer = (data: Row[], marlaSqft = "272.25"): Row[] =>
  data.map((row) => {
    const flat = /^(\d+) Room Flat$/i.exec(String(row.unitType));
    return {
      ...row,
      unitType: flat ? "Flat" : row.unitType,
      rooms: String(row.rooms ?? flat?.[1] ?? "0"),
      totalArea: row.totalArea ?? salesEstimateTotals(row, marlaSqft).totalArea,
      units: String(row.units ?? "0"),
    };
  });

export function SalesEstimate({
  projectId,
  canEdit,
  marlaSqft,
  onEditingChange,
  onDirty,
}: {
  projectId: string;
  canEdit: boolean;
  marlaSqft: string;
  onEditingChange: (editing: boolean) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [original, setOriginal] = useState<Row[]>([]),
    [removed, setRemoved] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [editing, setEditing] = useState(false);
  const gridEdit = useRef<GridEditHandle>(null);
  const editable = canEdit && editing;
  const path = `projects/${projectId}/workbook/${sheet}`;

  useEffect(() => {
    let active = true;
    api<Row[]>(path)
      .then((data) => {
        if (!active) return;
        const clean = fromServer(data, marlaSqft);
        setOriginal(structuredClone(clean));
        setRows(canEdit ? [...clean, blank()] : clean);
        setLoaded(true);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [path, canEdit, marlaSqft]);

  const changed = (row: Row) =>
    row._new
      ? !row._placeholder
      : JSON.stringify(workbookData(sheet, row)) !==
        JSON.stringify(workbookData(sheet, original.find((r) => r.id === row.id) ?? {}));
  const dirty = removed.length > 0 || rows.some(changed);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    onEditingChange(editing);
    return () => onEditingChange(false);
  }, [editing, onEditingChange]);

  const normalize = (values: Row[]): Row[] =>
    values.map((row) => ({
      ...row,
      _placeholder:
        Boolean(row._new) &&
        JSON.stringify(workbookData(sheet, row)) === JSON.stringify(blankWorkbookRow(sheet)),
    }));

  async function save() {
    const current = normalize(gridEdit.current?.commit() ?? rows);
    setBusy(true);
    setError("");
    const next: Row[] = [];
    const pendingRemoval: Row[] = [];
    let failed = false;
    for (const row of removed) {
      try {
        await api(`${path}/${row.id}`, "DELETE", { version: row.version });
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
        const saved = fromServer(
          [
            await api<Row>(
              row._new ? path : `${path}/${row.id}`,
              row._new ? "POST" : "PATCH",
              row._new ? data : { version: row.version, data },
            ),
          ],
          marlaSqft,
        )[0];
        setOriginal((previous) => [...previous.filter((r) => r.id !== saved.id), saved]);
        next.push(saved);
      } catch (e) {
        failed = true;
        next.push({ ...row, error: entryError(e) });
      }
    }
    setRows([...next, blank()]);
    setBusy(false);
    if (!failed) setEditing(false);
    else
      setError(
        pendingRemoval.length
          ? "Some rows could not be removed. Your other changes are saved. Try Save again; if the row changed, reopen the sheet to reload it."
          : "Some rows could not be saved. Correct the highlighted entries; your other rows are saved.",
      );
  }

  function removeRow(row: Row) {
    if (!editable || busy) return;
    const current = normalize(gridEdit.current?.commit() ?? rows);
    const index = row.id ? current.findIndex((r) => r.id === row.id) : Number(row._rowIndex);
    const target = current[index];
    if (!target || target._placeholder) return;
    if (!target._new) setRemoved((previous) => [...previous, target]);
    const next = current.filter((_, i) => i !== index);
    if (!next[next.length - 1]?._placeholder) next.push(blank());
    setRows(next);
  }

  function quickAdd(unitType: string) {
    if (!editable || busy) return;
    const current = normalize(gridEdit.current?.commit() ?? rows);
    const withoutBlank = current.filter((row) => !row._placeholder);
    setRows([
      ...withoutBlank,
      {
        ...blank(),
        unitType: unitType === "Shop" ? "Shop" : "Flat",
        rooms: unitType === "Shop" ? "0" : unitType.split(" ")[0],
        _placeholder: false,
      },
      blank(),
    ]);
  }

  const calculated =
    (pick: (totals: ReturnType<typeof salesEstimateTotals>) => string) =>
    (params: { data?: Row }) => {
      if (!params.data || params.data._placeholder) return "";
      try {
        return pick(salesEstimateTotals(params.data, marlaSqft));
      } catch {
        return "Invalid";
      }
    };
  const right = { cellClass: "ag-right-aligned-cell", headerClass: "ag-right-aligned-header" };
  const fixed = (width: number) => ({
    width,
    minWidth: width,
    maxWidth: width,
    flex: 0,
    wrapHeaderText: true,
    autoHeaderHeight: true,
  });
  const grow = (minWidth: number) => ({
    minWidth,
    flex: 1,
    wrapHeaderText: true,
    autoHeaderHeight: true,
  });
  const money = (field: string) => ({
    ...right,
    valueFormatter: (params: { value: unknown; data?: Row }) => formatNumber(params.value),
    field,
  });
  const columns: ColDef<Row>[] = [
    {
      colId: "serial",
      headerName: "S.No",
      ...fixed(60),
      editable: false,
      valueGetter: (params) => (params.data?._placeholder ? "" : (params.node?.rowIndex ?? 0) + 1),
    },
    {
      field: "unitType",
      headerName: "Unit Type",
      ...grow(100),
      editable: editable && !busy,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: ["Flat", "Shop"] },
      valueSetter: (p) => {
        if (!p.data) return false;
        p.data.unitType = p.newValue;
        if (p.newValue === "Shop") p.data.rooms = "0";
        return true;
      },
    },
    {
      field: "rooms",
      headerName: "Rooms",
      ...grow(65),
      ...right,
      editable: (p) => editable && !busy && p.data?.unitType === "Flat",
      valueFormatter: (p) => (p.data?.unitType === "Shop" ? "�" : formatNumber(p.value)),
    },
    {
      field: "units",
      headerName: "No. of Units",
      ...grow(75),
      ...right,
      editable: editable && !busy,
      valueFormatter: (params) => formatNumber(params.value),
    },
    {
      field: "totalArea",
      headerName: "Total Area (sq ft)",
      ...grow(110),
      ...right,
      editable: editable && !busy,
      valueFormatter: (p) => formatNumber(p.value),
    },
    {
      ...money("minimumPrice"),
      headerName: "Min Price / Unit",
      ...grow(110),
      editable: editable && !busy,
    },
    {
      ...money("maximumPrice"),
      headerName: "Max Price / Unit",
      ...grow(110),
      editable: editable && !busy,
    },
    {
      colId: "minimumTotal",
      headerName: "Total Min",
      ...grow(110),
      ...right,
      editable: false,
      valueGetter: calculated((totals) => compact(totals.minimumTotal)),
    },
    {
      colId: "maximumTotal",
      headerName: "Total Max",
      ...grow(110),
      ...right,
      editable: false,
      valueGetter: calculated((totals) => compact(totals.maximumTotal)),
    },
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
            cellRenderer: (params: ICellRendererParams<Row>) =>
              params.data && !params.data._placeholder ? (
                <button
                  type="button"
                  className="estimate-delete"
                  aria-label={`Delete ${params.data.unitType || "row"}`}
                  title="Delete row"
                  disabled={busy}
                  onClick={() => removeRow(params.data!)}
                >
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              ) : null,
          } satisfies ColDef<Row>,
        ]
      : []),
  ];

  return (
    <div className="register-sheet-content sales-sheet">
      {error && <p role="alert">{error}</p>}
      {loaded && (
        <div
          className="sheet-toolbar estimate-actions"
          role="toolbar"
          aria-label="Sales estimate actions"
        >
          {editable && (
            <span className="sales-quick-add">
              Quick add:
              {quickTypes.map((name) => (
                <button key={name} type="button" disabled={busy} onClick={() => quickAdd(name)}>
                  + {name}
                </button>
              ))}
            </span>
          )}
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
          emptyMessage="No sales estimates yet. Click Edit to add Flats or Shops."
          screen={`project-${sheet}-v2-${projectId}`}
          rows={editing ? rows : rows.filter((row) => !row._placeholder)}
          toolbar={false}
          singleClickEdit={editing}
          busy={busy}
          columns={columns.map((column) => ({
            cellDataType: false,
            cellEditor: "agTextCellEditor",
            cellEditorParams: { useFormatter: false },
            ...column,
          }))}
          onChange={
            editable && !busy
              ? (values) => {
                  const next = normalize(values);
                  if (!next[next.length - 1]?._placeholder) next.push(blank());
                  setRows(next);
                }
              : undefined
          }
          summary={(visible) => <SalesSummary rows={visible} marlaSqft={marlaSqft} />}
        />
      )}
    </div>
  );
}

export function SalesSummary({ rows, marlaSqft }: { rows: Row[]; marlaSqft: string }) {
  const valid = rows.filter((row) => {
    if (row._placeholder) return false;
    return workbookSchemas[sheet].safeParse(workbookData(sheet, row)).success;
  });
  const totals = valid.map((row) => salesEstimateTotals(row, marlaSqft));
  const stat = (label: string, value: string) => (
    <span key={label}>
      {label}
      <strong>{value}</strong>
    </span>
  );
  const considered = rows.filter((row) => !row._placeholder).length;
  return (
    <>
      <span className="sheet-summary-label">
        Visible rows · includes unsaved edits
        {valid.length !== considered ? " · incomplete rows excluded" : ""}
      </span>
      {stat("Unit Types", String(valid.length))}
      {stat(
        "Total Units",
        formatNumber(valid.reduce((total, row) => total + Number(row.units), 0)),
      )}
      {stat("Total Area (sq ft)", formatNumber(sumAreas(totals.map((total) => total.totalArea))))}
      {stat(
        "Minimum Sales",
        formatPKR(totals.reduce((total, row) => total + row.minimumTotal, 0n)),
      )}
      {stat(
        "Maximum Sales",
        formatPKR(totals.reduce((total, row) => total + row.maximumTotal, 0n)),
      )}
    </>
  );
}


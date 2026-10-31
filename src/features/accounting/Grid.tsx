import { useRef, useState, useMemo, useImperativeHandle, type Ref, type ReactNode } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  themeQuartz,
  ModuleRegistry,
  AllCommunityModule,
  type ColDef,
  type GridApi,
} from "ag-grid-community";
import { api } from "@/data/api";
ModuleRegistry.registerModules([AllCommunityModule]);
const accountingTheme = themeQuartz.withParams({
  backgroundColor: "var(--card)",
  foregroundColor: "var(--foreground)",
  borderColor: "var(--border)",
  headerBackgroundColor: "var(--muted)",
  headerTextColor: "var(--foreground)",
  fontFamily: "inherit",
  fontSize: 14,
});
export type Row = Record<string, unknown>;
export type GridEditHandle = { commit: () => Row[] };
export const titleCase = (name: string) =>
  name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
const errorText = (row?: Row) => String(row?.cost_head_error || row?.error || "");
export function Grid({
  screen,
  rows,
  columns,
  onChange,
  onSelect,
  onCellChange,
  totals,
  short = false,
  toolbarContent,
  showSearch = true,
  singleClickEdit = false,
  editHandle,
  newLabel,
  onNew,
  summary,
  onSave,
  saveLabel = "Save Changes",
  busy = false,
  emptyMessage = "No records yet. Type in the first row to get started.",
  toolbar = !short,
}: {
  screen: string;
  rows: Row[];
  columns: ColDef<Row>[];
  onChange?: (rows: Row[]) => void;
  onSelect?: (row: Row) => void;
  onCellChange?: (row: Row, field: string, oldValue: unknown) => void;
  totals?: (rows: Row[]) => Row;
  short?: boolean;
  toolbarContent?: ReactNode;
  showSearch?: boolean;
  singleClickEdit?: boolean;
  editHandle?: Ref<GridEditHandle>;
  newLabel?: string;
  onNew?: () => void;
  summary?: (rows: Row[]) => ReactNode;
  onSave?: () => void;
  saveLabel?: string;
  busy?: boolean;
  emptyMessage?: string;
  toolbar?: boolean;
}) {
  const ref = useRef<AgGridReact<Row>>(null);
  useImperativeHandle(editHandle, () => ({
    commit() {
      const grid = ref.current?.api;
      if (!grid) return rows;
      grid.stopEditing();
      const current: Row[] = [];
      grid.forEachNode((node) => {
        if (node.data) {
          const { _rowIndex: _index, _gridId: _id, ...row } = node.data;
          current.push(row);
        }
      });
      return current;
    },
  }));
  const [message, setMessage] = useState(""),
    [search, setSearch] = useState("");
  const [filterRow, setFilterRow] = useState(false),
    [selected, setSelected] = useState<Row | null>(null);
  const [footer, setFooter] = useState<Row[]>([]);
  const [summaryRows, setSummaryRows] = useState<Row[]>([]);
  const viewRows = useMemo(
    () =>
      rows.map((r, index) => ({
        ...r,
        _rowIndex: index,
        _gridId: String(r.id ?? screen + "-" + index),
      })),
    [rows, screen],
  );
  const gridColumns = useMemo<ColDef<Row>[]>(
    () =>
      columns
        .filter((c) => c.field !== "error")
        .map((c, index) => ({
          ...c,
          headerName: c.headerName ?? titleCase(c.field ?? ""),
          pinned: c.pinned ?? (index === 0 ? "left" : undefined),
          floatingFilter: filterRow && c.filter !== false,
          tooltipValueGetter: (p) => errorText(p.data) || String(p.value ?? ""),
          cellClassRules: {
            ...c.cellClassRules,
            "invalid-cell": (p) =>
              Boolean(errorText(p.data)) &&
              (p.data?.cost_head_error ? c.field === "cost_head" : true),
          },
          editable:
            typeof c.editable === "boolean"
              ? (p) => !p.node.rowPinned && Boolean(c.editable)
              : c.editable,
        })),
    [columns, filterRow],
  );
  const defaults = useMemo<ColDef<Row>>(
    () => ({
      filter: true,
      sortable: true,
      resizable: true,
      minWidth: 72,
      flex: 1,
      suppressHeaderMenuButton: true,
      suppressHeaderFilterButton: true,
      floatingFilterComponentParams: { suppressFilterButton: true },
    }),
    [],
  );
  const updateFooter = (a: GridApi<Row>) => {
    if (!totals && !summary) return;
    const visible: Row[] = [];
    a.forEachNodeAfterFilter((n) => {
      if (n.data && !n.data._placeholder) visible.push(n.data);
    });
    if (totals) setFooter([totals(visible)]);
    if (summary) setSummaryRows(visible);
  };
  async function exportFile() {
    try {
      const a = ref.current!.api,
        cols = a.getAllDisplayedColumns();
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook(),
        sheet = workbook.addWorksheet(screen.slice(0, 31)),
        data: Row[] = [];
      sheet.addRow(cols.map((c) => c.getColDef().headerName ?? c.getColId()));
      a.forEachNodeAfterFilterAndSort((n) => {
        if (!n.data || n.data._placeholder) return;
        data.push(n.data);
        sheet.addRow(
          cols.map((c) =>
            String(a.getCellValue({ rowNode: n, colKey: c, useFormatter: true }) ?? ""),
          ),
        );
      });
      if (totals) {
        const sum = totals(data),
          pinned = a.getPinnedBottomRow(0);
        sheet.addRow(
          cols.map((c) =>
            pinned
              ? String(a.getCellValue({ rowNode: pinned, colKey: c, useFormatter: true }) ?? "")
              : String(sum[c.getColId()] ?? ""),
          ),
        );
      }
      sheet.getRow(1).font = { bold: true };
      sheet.columns.forEach((c) => {
        c.width = 24;
      });
      const bytes = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = screen + ".xlsx";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function copy() {
    const a = ref.current!.api,
      cols = a.getAllDisplayedColumns();
    const lines = [cols.map((c) => c.getColDef().headerName ?? c.getColId()).join("\t")];
    a.forEachNodeAfterFilterAndSort((n) => {
      if (n.data?._placeholder) return;
      lines.push(
        cols
          .map((c) => String(a.getCellValue({ rowNode: n, colKey: c, useFormatter: true }) ?? ""))
          .join("\t"),
      );
    });
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setMessage("Filtered rows copied");
    } catch (e) {
      setMessage(String(e));
    }
  }
  function focusNew() {
    const a = ref.current!.api;
    setSearch("");
    a.setGridOption("quickFilterText", "");
    a.setFilterModel(null);
    let index = -1;
    a.forEachNodeAfterFilterAndSort((n) => {
      if (n.data?._new) index = n.rowIndex ?? index;
    });
    if (index < 0) index = Math.max(0, a.getDisplayedRowCount() - 1);
    const col = a.getAllDisplayedColumns()[0];
    if (col) {
      a.ensureIndexVisible(index);
      a.setFocusedCell(index, col);
      a.startEditingCell({ rowIndex: index, colKey: col });
    }
  }
  return (
    <>
      {toolbar && (
        <div className="sheet-toolbar" role="toolbar" aria-label={titleCase(screen) + " tools"}>
          {newLabel && (
            <button className="sheet-primary" disabled={busy} onClick={onNew ?? focusNew}>
              + {newLabel}
            </button>
          )}
          {showSearch && (
            <input
              className="sheet-search"
              aria-label={"Search " + titleCase(screen)}
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          {toolbarContent}
          <button aria-pressed={filterRow} onClick={() => setFilterRow((v) => !v)}>
            Filter
          </button>
          <button onClick={exportFile}>Export to Excel</button>
          {onSelect && (
            <button
              disabled={!selected || Boolean(selected._new)}
              onClick={() => selected && onSelect(selected)}
            >
              Open
            </button>
          )}
          {onSave && (
            <button
              className="sheet-primary"
              disabled={busy}
              onClick={() => {
                ref.current?.api.stopEditing();
                onSave();
              }}
            >
              {saveLabel}
            </button>
          )}
          <details className="sheet-more">
            <summary>More</summary>
            <div className="sheet-menu">
              <button onClick={copy}>Copy rows</button>
              <button
                onClick={async () => {
                  try {
                    const a = ref.current!.api;
                    await api("views/" + screen, "PUT", {
                      columns: a.getColumnState(),
                      filters: a.getFilterModel(),
                    });
                    setMessage("View saved");
                  } catch (e) {
                    setMessage(String(e));
                  }
                }}
              >
                Save view
              </button>
              <details>
                <summary>Columns and pinning</summary>
                {columns
                  .filter((c) => c.field && c.field !== "error")
                  .map((c) => (
                    <label key={c.field}>
                      {titleCase(c.headerName ?? c.field!)}
                      <select
                        aria-label={c.field + " visibility"}
                        defaultValue={c.hide ? "hide" : c.pinned ? "pin" : "show"}
                        onChange={(e) => {
                          const a = ref.current!.api;
                          a.setColumnsVisible([c.field!], e.target.value !== "hide");
                          a.setColumnsPinned([c.field!], e.target.value === "pin" ? "left" : null);
                        }}
                      >
                        <option value="show">Show</option>
                        <option value="pin">Pin left</option>
                        <option value="hide">Hide</option>
                      </select>
                    </label>
                  ))}
              </details>
            </div>
          </details>
        </div>
      )}
      {message && <small role="status">{message}</small>}
      {rows.every((r) => r._placeholder) && <p className="sheet-empty">{emptyMessage}</p>}
      {rows.some((r) => errorText(r)) && (
        <p className="sheet-validation" role="status">
          {errorText(rows.find((r) => errorText(r)))} — correct the highlighted cells.
        </p>
      )}
      <div
        className={short ? "grid-short" : "grid"}
        onCopyCapture={(e) => {
          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
            return;
          const a = ref.current!.api,
            focus = a.getFocusedCell();
          if (!focus) return;
          const row = a.getDisplayedRowAtIndex(focus.rowIndex);
          if (!row) return;
          e.preventDefault();
          e.clipboardData.setData(
            "text/plain",
            String(
              a.getCellValue({ rowNode: row, colKey: focus.column, useFormatter: true }) ?? "",
            ),
          );
        }}
        onPasteCapture={(e) => {
          if (!onChange && !onCellChange) return;
          const text = e.clipboardData.getData("text");
          if (
            !text.includes("\t") &&
            !text.includes("\n") &&
            (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
          )
            return;
          e.preventDefault();
          e.stopPropagation();
          const a = ref.current!.api,
            focus = a.getFocusedCell(),
            cols = a.getAllDisplayedColumns();
          if (focus?.rowPinned) return;
          const start = Math.max(
            0,
            cols.findIndex((c) => c.getColId() === focus?.column.getColId()),
          );
          const next = rows.map((r) => ({ ...r })),
            first = focus?.rowIndex ?? Math.max(0, a.getDisplayedRowCount() - 1);
          const changes: { row: Row; field: string; oldValue: unknown }[] = [];
          text
            .replace(/\r/g, "")
            .replace(/\n$/, "")
            .split("\n")
            .forEach((line, offset) => {
              const displayed = a.getDisplayedRowAtIndex(first + offset);
              const index = displayed?.data ? Number(displayed.data._rowIndex) : next.length;
              const target = next[index] ?? { _new: true };
              line.split("\t").forEach((value, j) => {
                const col = cols[start + j],
                  def = columns.find((c) => c.field === col?.getColId());
                const template = a.getDisplayedRowAtIndex(a.getDisplayedRowCount() - 1);
                const editable = displayed
                  ? col?.isCellEditable(displayed)
                  : template && (newLabel || screen === "voucher-lines")
                    ? col?.isCellEditable(template)
                    : def?.editable === true;
                if (col && editable) {
                  const field = col.getColId(),
                    oldValue = target[field];
                  target[field] = value;
                  if (oldValue !== value) changes.push({ row: target, field, oldValue });
                }
              });
              next[index] = target;
            });
          onChange?.(next);
          for (const c of changes) onCellChange?.(c.row, c.field, c.oldValue);
        }}
      >
        <AgGridReact<Row>
          ref={ref}
          theme={accountingTheme}
          rowData={viewRows}
          getRowId={(p) => String(p.data._gridId)}
          columnDefs={gridColumns}
          defaultColDef={defaults}
          pinnedBottomRowData={footer}
          rowHeight={40}
          headerHeight={42}
          floatingFiltersHeight={36}
          quickFilterText={search}
          tooltipShowDelay={150}
          enterNavigatesVertically
          enterNavigatesVerticallyAfterEdit
          stopEditingWhenCellsLoseFocus
          singleClickEdit={singleClickEdit}
          suppressNoRowsOverlay={rows.every((row) => row._placeholder)}
          overlayNoRowsTemplate="<span>No matching records.</span>"
          postSortRows={(p) => {
            const normal = p.nodes.filter((n) => !n.data?._new),
              draft = p.nodes.filter((n) => n.data?._new);
            p.nodes.splice(0, p.nodes.length, ...normal, ...draft);
          }}
          onCellFocused={(e) =>
            setSelected(
              e.rowIndex == null ? null : (e.api.getDisplayedRowAtIndex(e.rowIndex)?.data ?? null),
            )
          }
          rowClassRules={{
            "error-row": (p) => Boolean(errorText(p.data)),
            "unbalanced-row": (p) => Boolean(p.data?._unbalanced),
            "new-entry-row": (p) => Boolean(p.data?._new),
          }}
          onGridReady={async (e) => {
            try {
              const view = await api<{
                columns: ReturnType<GridApi["getColumnState"]>;
                filters: Record<string, unknown>;
              } | null>("views/" + screen);
              if (view && !e.api.isDestroyed()) {
                e.api.applyColumnState({
                  state: view.columns.map(({ colId, hide, pinned, sort, sortIndex }) => ({
                    colId,
                    hide,
                    pinned,
                    sort,
                    sortIndex,
                  })),
                  applyOrder: true,
                });
                e.api.setFilterModel(view.filters);
              }
            } catch {
              /* Saved views are optional. */
            }
          }}
          onRowDataUpdated={(e) => updateFooter(e.api)}
          onFilterChanged={(e) => updateFooter(e.api)}
          onCellValueChanged={(event) => {
            if (event.data && event.colDef.field)
              onCellChange?.(event.data, event.colDef.field, event.oldValue);
            const next: Row[] = [];
            ref.current!.api.forEachNode((n) => {
              if (n.data) {
                const { _rowIndex: _index, _gridId: _id, ...row } = n.data;
                next.push(row);
              }
            });
            onChange?.(next);
          }}
          onRowDoubleClicked={(e) => {
            if (e.data && !e.data._new) onSelect?.(e.data);
          }}
          onCellKeyDown={(e) => {
            if (
              (e.event as KeyboardEvent)?.key === "Enter" &&
              (e.event as KeyboardEvent)?.altKey &&
              e.data &&
              !e.data._new
            )
              onSelect?.(e.data);
          }}
        />
      </div>
      {summary && (
        <section className="sheet-summary" aria-label="Sheet calculations" aria-live="polite">
          {summary(summaryRows)}
        </section>
      )}
    </>
  );
}

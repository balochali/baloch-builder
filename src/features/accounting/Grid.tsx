import { useRef, useState, useMemo } from "react";
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
});
export type Row = Record<string, unknown>;
export function Grid({
  screen,
  rows,
  columns,
  onChange,
  onSelect,
  onCellChange,
  totals,
  short = false,
}: {
  screen: string;
  rows: Row[];
  columns: ColDef<Row>[];
  onChange?: (rows: Row[]) => void;
  onSelect?: (row: Row) => void;
  onCellChange?: (row: Row, field: string, oldValue: unknown) => void;
  totals?: (rows: Row[]) => Row;
  short?: boolean;
}) {
  const viewRows = useMemo(
    () =>
      rows.map((r, index) => ({
        ...r,
        _rowIndex: index,
        _gridId: String(r.id ?? `${screen}-${index}`),
      })),
    [rows, screen],
  );
  const gridColumns = useMemo(
    () =>
      columns.map((c) => ({
        ...c,
        editable:
          typeof c.editable === "boolean"
            ? (p: { node: { rowPinned?: string | null } }) =>
                !p.node.rowPinned && Boolean(c.editable)
            : c.editable,
      })),
    [columns],
  );
  const ref = useRef<AgGridReact<Row>>(null);
  const [message, setMessage] = useState("");
  const [footer, setFooter] = useState<Row[]>([]);
  const defaults = useMemo(
    () => ({ filter: true, sortable: true, resizable: true, minWidth: 130, flex: 1 }),
    [],
  );
  const updateFooter = (a: GridApi<Row>) => {
    if (totals) {
      const visible: Row[] = [];
      a.forEachNodeAfterFilter((n) => {
        if (n.data) visible.push(n.data);
      });
      setFooter([totals(visible)]);
    }
  };
  async function exportFile() {
    try {
      const a = ref.current!.api;
      const cols = a.getAllDisplayedColumns();
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(screen.slice(0, 31));
      sheet.addRow(cols.map((c) => c.getColDef().headerName ?? c.getColId()));
      const data: Row[] = [];
      a.forEachNodeAfterFilterAndSort((n) => {
        if (n.data) {
          data.push(n.data);
          sheet.addRow(
            cols.map((c) =>
              String(a.getCellValue({ rowNode: n, colKey: c, useFormatter: true }) ?? ""),
            ),
          );
        }
      });
      if (totals) {
        const sum = totals(data);
        const pinned = a.getPinnedBottomRow(0);
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
      link.download = `${screen}.xlsx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function copy() {
    const a = ref.current!.api;
    const cols = a.getAllDisplayedColumns();
    const lines: string[] = [cols.map((c) => c.getColDef().headerName ?? c.getColId()).join("\t")];
    a.forEachNodeAfterFilterAndSort((n) => {
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
  return (
    <>
      <div className="toolbar">
        <button onClick={exportFile}>Export Excel</button>
        <button onClick={copy}>Copy filtered rows</button>
        <button
          onClick={async () => {
            try {
              const a = ref.current!.api;
              await api(`views/${screen}`, "PUT", {
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
            .filter((c) => c.field)
            .map((c) => (
              <label key={c.field}>
                {c.headerName ?? c.field}
                <select
                  aria-label={`${c.field} visibility`}
                  defaultValue="show"
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
        {message && <span role="status">{message}</span>}
      </div>
      <div
        className={short ? "grid-short" : "grid"}
        onPasteCapture={(e) => {
          if (!onChange && !onCellChange) return;
          const text = e.clipboardData.getData("text");
          if (!text.includes("\t") && !text.includes("\n")) return;
          e.preventDefault();
          e.stopPropagation();
          const a = ref.current!.api;
          const focus = a.getFocusedCell();
          const cols = a.getAllDisplayedColumns();
          const start = Math.max(
            0,
            cols.findIndex((c) => c.getColId() === focus?.column.getColId()),
          );
          const next = rows.map((r) => ({ ...r }));
          const firstDisplayed = focus?.rowIndex ?? a.getDisplayedRowCount();
          if (focus?.rowPinned) return;
          const changes: { row: Row; field: string; oldValue: unknown }[] = [];
          text
            .replace(/\r/g, "")
            .replace(/\n$/, "")
            .split("\n")
            .forEach((line, offset) => {
              const displayed = a.getDisplayedRowAtIndex(firstDisplayed + offset);
              const index = displayed?.data ? Number(displayed.data._rowIndex) : next.length;
              const target = next[index] ?? {};
              line.split("\t").forEach((value, j) => {
                const col = cols[start + j];
                if (
                  col &&
                  (displayed
                    ? col.isCellEditable(displayed)
                    : columns.find((def) => def.field === col.getColId())?.editable === true)
                ) {
                  const field = col.getColId();
                  const oldValue = target[field];
                  target[field] = value;
                  if (oldValue !== value) changes.push({ row: target, field, oldValue });
                }
              });
              next[index] = target;
            });
          onChange?.(next);
          for (const change of changes) onCellChange?.(change.row, change.field, change.oldValue);
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
          stopEditingWhenCellsLoseFocus
          singleClickEdit={false}
          rowClassRules={{
            "error-row": (p) => Boolean(p.data?.error || p.data?.cost_head_error),
            "unbalanced-row": (p) => Boolean(p.data?._unbalanced),
          }}
          onGridReady={async (e) => {
            try {
              const view = await api<{
                columns: ReturnType<GridApi["getColumnState"]>;
                filters: Record<string, unknown>;
              } | null>(`views/${screen}`);
              if (view && !e.api.isDestroyed()) {
                e.api.applyColumnState({ state: view.columns, applyOrder: true });
                e.api.setFilterModel(view.filters);
              }
            } catch {
              /* Login grids have no authenticated saved views. */
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
            if (e.data) onSelect?.(e.data);
          }}
          onCellKeyDown={(e) => {
            if ((e.event as KeyboardEvent)?.key === "Enter" && !onChange && !onCellChange && e.data)
              onSelect?.(e.data);
          }}
        />
      </div>
    </>
  );
}

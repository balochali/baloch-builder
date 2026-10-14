import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { tidyCell, parseWhole } from "./sheetParsing";
import "./sheet.css";

export interface SheetColumn {
  key: string;
  label: string;
  width: number;
  kind?: "text" | "number" | "date";
  required?: boolean;
  /** Suggestions shown while typing (the person may still type anything). */
  options?: string[];
  placeholder?: string;
  /** Show the total of this column under the table. */
  sum?: boolean;
  readOnly?: boolean;
}

export interface SheetRow {
  id: string;
  cells: Record<string, string>;
  error?: string;
}

let counter = 0;
export const newRowId = () => `row-${Date.now().toString(36)}-${counter++}`;
export const emptyRow = (): SheetRow => ({ id: newRowId(), cells: {} });
export const rowIsBlank = (row: SheetRow) =>
  Object.values(row.cells).every((value) => !value.trim());

/** Excel quotes cells containing tabs, line breaks, or quotes. */
export function parseClipboard(text: string): string[][] {
  const rows: string[][] = [[]];
  let cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && (quoted || !cell)) {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (ch === "\t" || ch === "\n")) {
      rows[rows.length - 1].push(cell);
      cell = "";
      if (ch === "\n") rows.push([]);
    } else cell += ch;
  }
  rows[rows.length - 1].push(cell);
  return rows;
}

interface SheetGridProps {
  name: string;
  columns: SheetColumn[];
  rows: SheetRow[];
  onRows: (rows: SheetRow[]) => void;
  disabled?: boolean;
  allowAdd?: boolean;
  canDelete?: (row: SheetRow) => boolean;
  onOpen?: (row: SheetRow) => void;
}

export function SheetGrid({
  name,
  columns,
  rows,
  onRows,
  disabled,
  allowAdd = true,
  canDelete,
  onOpen,
}: SheetGridProps) {
  const refs = useRef(new Map<string, HTMLInputElement>());
  const pendingFocus = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!pendingFocus.current) return;
    const [r, c] = pendingFocus.current;
    pendingFocus.current = null;
    refs.current.get(`${r}:${c}`)?.focus();
  });

  const setCell = (rowIndex: number, key: string, value: string) =>
    onRows(
      rows.map((row, i) =>
        i === rowIndex ? { ...row, cells: { ...row.cells, [key]: value }, error: undefined } : row,
      ),
    );

  function focusCell(r: number, c: number) {
    if (r >= rows.length) {
      if (!allowAdd) return;
      pendingFocus.current = [r, c];
      onRows([...rows, emptyRow()]);
      return;
    }
    refs.current.get(`${r}:${c}`)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, r: number, c: number) {
    if (event.key === "Enter") {
      event.preventDefault();
      focusCell(r + (event.shiftKey ? -1 : 1), c);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusCell(r + 1, c);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusCell(r - 1, c);
    } else if (
      event.key === "Tab" &&
      !event.shiftKey &&
      r === rows.length - 1 &&
      c === columns.length - 1
    ) {
      event.preventDefault();
      focusCell(r + 1, 0);
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>, r: number, c: number) {
    const text = event.clipboardData.getData("text").replace(/\r/g, "").replace(/\n+$/, "");
    if (!text.includes("\t") && !text.includes("\n")) return; // a single value pastes normally
    event.preventDefault();
    let lines = parseClipboard(text);
    // Skip a pasted header row (the column titles copied from Excel).
    const labels = columns.map((column) => column.label.toLowerCase().replace(/\s*\*$/, ""));
    const first = lines[0].map((cell) => cell.trim().toLowerCase());
    if (first.length > 1 && first.every((cell, j) => cell === labels[c + j]))
      lines = lines.slice(1);
    const next = rows.map((row) => ({ ...row, cells: { ...row.cells } }));
    lines.forEach((line, i) => {
      if (!allowAdd && r + i >= next.length) return;
      while (next.length <= r + i) next.push(emptyRow());
      const target = next[r + i];
      target.error = undefined;
      line.forEach((cell, j) => {
        const column = columns[c + j];
        if (column && !column.readOnly) target.cells[column.key] = tidyCell(column.kind, cell);
      });
    });
    onRows(next);
  }

  const totals = columns
    .filter((column) => column.sum)
    .map((column) => ({
      label: column.label,
      total: rows.reduce((sum, row) => {
        try {
          return sum + (parseWhole(column.label, row.cells[column.key] ?? "") ?? 0);
        } catch {
          return sum;
        }
      }, 0),
    }));

  return (
    <div className="sheet-wrap">
      <div className="sheet-scroll">
        <table className="sheet-table" aria-label={name}>
          <thead>
            <tr>
              <th className="sheet-num">#</th>
              {columns.map((column) => (
                <th key={column.key} style={{ minWidth: column.width }}>
                  {column.label}
                  {column.required && <span className="sheet-req"> *</span>}
                </th>
              ))}
              <th className="sheet-status-head">Status</th>
              <th className="sheet-del" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={row.id} className={row.error ? "sheet-row-bad" : undefined}>
                <td className="sheet-num">{r + 1}</td>
                {columns.map((column, c) => {
                  const listId = column.options ? `${name}-${column.key}-list` : undefined;
                  return (
                    <td key={column.key}>
                      <input
                        ref={(node) => {
                          if (node) refs.current.set(`${r}:${c}`, node);
                          else refs.current.delete(`${r}:${c}`);
                        }}
                        className={`sheet-cell${column.kind === "number" ? " is-number" : ""}`}
                        aria-label={`${column.label} row ${r + 1}`}
                        value={row.cells[column.key] ?? ""}
                        placeholder={column.placeholder}
                        list={listId}
                        disabled={disabled}
                        readOnly={column.readOnly}
                        aria-readonly={column.readOnly}
                        autoComplete="off"
                        inputMode={column.kind === "number" ? "numeric" : undefined}
                        onChange={(event) => setCell(r, column.key, event.target.value)}
                        onBlur={(event) => {
                          const tidy = tidyCell(column.kind, event.target.value);
                          if (tidy !== event.target.value) setCell(r, column.key, tidy);
                        }}
                        onKeyDown={(event) => onKeyDown(event, r, c)}
                        onPaste={(event) => onPaste(event, r, c)}
                      />
                    </td>
                  );
                })}
                <td className="sheet-status">
                  {onOpen && (
                    <button
                      type="button"
                      className="sheet-add"
                      disabled={disabled}
                      onClick={() => onOpen(row)}
                    >
                      Open file
                    </button>
                  )}
                  {row.error ? (
                    <span className="sheet-error" role="alert">
                      <AlertCircle size={14} aria-hidden /> {row.error}
                    </span>
                  ) : null}
                </td>
                <td className="sheet-del">
                  <button
                    type="button"
                    className="sheet-icon"
                    aria-label={`Delete row ${r + 1}`}
                    disabled={disabled || (canDelete && !canDelete(row))}
                    onClick={() => {
                      const left = rows.filter((_, i) => i !== r);
                      onRows(left.length ? left : [emptyRow()]);
                    }}
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {columns.map(
          (column) =>
            column.options && (
              <datalist key={column.key} id={`${name}-${column.key}-list`}>
                {column.options.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            ),
        )}
      </div>
      <div className="sheet-foot">
        <button
          type="button"
          className="sheet-add"
          disabled={disabled || !allowAdd}
          onClick={() => {
            pendingFocus.current = [rows.length, 0];
            onRows([...rows, emptyRow()]);
          }}
        >
          <Plus size={15} aria-hidden /> Add row
        </button>
        <button
          type="button"
          className="sheet-add"
          disabled={disabled || !allowAdd}
          onClick={() => {
            pendingFocus.current = [rows.length, 0];
            onRows([...rows, ...Array.from({ length: 10 }, emptyRow)]);
          }}
        >
          <Plus size={15} aria-hidden /> Add 10 rows
        </button>
        {totals.map((item) => (
          <span key={item.label} className="sheet-total">
            <CheckCircle2 size={14} aria-hidden /> Total {item.label}:{" "}
            <strong>Rs {item.total.toLocaleString("en-PK")}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

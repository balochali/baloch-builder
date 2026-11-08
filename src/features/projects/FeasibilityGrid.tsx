import { useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";

export type Cell = {
  value: string;
  readOnly?: boolean;
  numeric?: boolean;
  editValue?: string;
  title?: string;
  warning?: boolean;
  shorthand?: boolean;
  choices?: readonly string[];
  allowCustom?: boolean;
  validate?: (value: string) => boolean;
};
export const figure = (value: number | null) =>
  value === null ? "—" : value.toLocaleString("en-PK", { maximumFractionDigits: 12 });
export const numericValue = (value: string) => Number(value.replace(/,/g, ""));
export function numberCell(value: number | undefined, max = 1e15, integer = false): Cell {
  return {
    value: value === undefined ? "" : figure(value),
    numeric: true,
    validate: (raw) => {
      const clean = raw.replace(/,/g, "").trim();
      const n = Number(clean);
      return (
        /^\d*(?:\.\d+)?$/.test(clean) &&
        Number.isFinite(n) &&
        n >= 0 &&
        n <= max &&
        (!integer || Number.isInteger(n))
      );
    },
  };
}
type GridProps = {
  headers: readonly string[];
  groups?: readonly { label: string; columns: number }[];
  rows: { id: string; cells: Cell[] }[];
  locked: boolean;
  onChange: (changes: { row: number; col: number; value: string }[]) => void;
  onAdd?: () => void;
  onDelete?: (row: number) => void;
  footer?: ReactNode;
};
export function FeasibilityGrid({
  headers,
  groups,
  rows,
  locked,
  onChange,
  onAdd,
  onDelete,
  footer,
}: GridProps) {
  const [edit, setEdit] = useState<{ row: number; col: number; text: string }>();
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState<string>();
  function valid(cell: Cell, value: string) {
    return (
      value.length <= 500 &&
      (!cell.choices || cell.allowCustom || cell.choices.includes(value)) &&
      (!cell.validate || cell.validate(value))
    );
  }
  function commit() {
    if (!edit) return true;
    const cell = rows[edit.row]?.cells[edit.col];
    if (!cell || !valid(cell, edit.text)) {
      setInvalid(`${edit.row}:${edit.col}`);
      setError("Enter a valid value for this cell.");
      return false;
    }
    if (edit.text !== (cell.editValue ?? cell.value))
      onChange([{ row: edit.row, col: edit.col, value: edit.text }]);
    setEdit(undefined);
    setInvalid(undefined);
    setError("");
    return true;
  }
  function focus(table: HTMLElement, row: number, col: number) {
    table.querySelector<HTMLInputElement>(`[data-cell="${row}:${col}"]`)?.focus();
  }
  function key(event: KeyboardEvent<HTMLInputElement>, row: number, col: number, cell: Cell) {
    const table = event.currentTarget.closest("table")!;
    if (event.key === "Escape" && edit) {
      event.preventDefault();
      event.stopPropagation();
      setEdit(undefined);
      setError("");
      return;
    }
    if (event.key === "F2" && !locked && !cell.readOnly) {
      event.preventDefault();
      setEdit({ row, col, text: cell.editValue ?? cell.value });
      event.currentTarget.select();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (!edit && !locked && !cell.readOnly) {
        setEdit({ row, col, text: cell.editValue ?? cell.value });
        event.currentTarget.select();
        return;
      }
      if (!commit()) return;
      if (row === rows.length - 1 && !locked && onAdd) {
        onAdd();
        requestAnimationFrame(() => focus(table, row + 1, col));
      } else requestAnimationFrame(() => focus(table, row + 1, col));
      return;
    }
    if (event.key === "Tab") {
      if (!commit()) {
        event.preventDefault();
        return;
      }
      const next = row * headers.length + col + (event.shiftKey ? -1 : 1);
      if (next >= 0 && next < rows.length * headers.length) {
        event.preventDefault();
        requestAnimationFrame(() =>
          focus(table, Math.floor(next / headers.length), next % headers.length),
        );
      }
      return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (!edit && arrows[event.key]) {
      event.preventDefault();
      const [dr, dc] = arrows[event.key];
      focus(table, row + dr, col + dc);
      return;
    }
    if (
      !edit &&
      !locked &&
      !cell.readOnly &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      setEdit({ row, col, text: event.key });
    }
  }
  function paste(event: ClipboardEvent<HTMLInputElement>, row: number, col: number) {
    if (locked) return;
    const raw = event.clipboardData.getData("text");
    if (edit && !/[\t\n]/.test(raw)) return;
    event.preventDefault();
    const changes: { row: number; col: number; value: string }[] = [];
    const lines = raw.replace(/\r/g, "").replace(/\n$/, "").split("\n");
    for (const [dy, line] of lines.entries())
      for (const [dx, value] of line.split("\t").entries()) {
        const cell = (rows[row + dy] ?? (onAdd && row + dy < 500 ? rows[row] : undefined))?.cells[
          col + dx
        ];
        if (!cell || cell.readOnly) continue;
        if (!valid(cell, value)) {
          setError(
            "Paste cancelled. Check the numbers, percentages, and choices in the copied cells.",
          );
          return;
        }
        changes.push({ row: row + dy, col: col + dx, value });
      }
    setEdit(undefined);
    setError(
      !onAdd && lines.length > rows.length - row
        ? "Paste reached the end of the grid. Add rows to paste more."
        : "",
    );
    onChange(changes);
  }
  return (
    <>
      <div className="feasibility-grid-scroll" tabIndex={0} aria-label="Spreadsheet">
        <table
          className={groups ? "feasibility-grid feasibility-grid-grouped" : "feasibility-grid"}
        >
          <thead>
            {groups && (
              <tr className="feasibility-column-groups">
                {groups.map((group) => (
                  <th key={group.label} scope="colgroup" colSpan={group.columns}>
                    {group.label}
                  </th>
                ))}
                {onDelete && !locked && <th aria-hidden="true" />}
              </tr>
            )}

            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  scope="col"
                  className={
                    header.startsWith("Min ")
                      ? "range-min"
                      : header.startsWith("Max ")
                        ? "range-max"
                        : undefined
                  }
                >
                  {header}
                </th>
              ))}
              {onDelete && !locked && <th scope="col" aria-label="Row actions" />}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, cells }, row) => (
              <tr key={id}>
                {cells.map((cell, col) => {
                  const editing = edit?.row === row && edit.col === col;
                  return (
                    <td
                      key={col}
                      className={
                        (cell.readOnly ? "computed " : "") + (cell.numeric ? "number" : "")
                      }
                    >
                      <input
                        data-cell={`${row}:${col}`}
                        aria-label={`${headers[col]}, row ${row + 1}`}
                        title={cell.title}
                        aria-invalid={cell.warning || invalid === `${row}:${col}` || undefined}
                        value={editing ? edit.text : cell.value}
                        readOnly={locked || cell.readOnly || !editing}
                        inputMode={cell.numeric && !cell.shorthand ? "decimal" : "text"}
                        list={
                          !locked && editing && cell.choices ? `choices-${id}-${col}` : undefined
                        }
                        onClick={(event) => {
                          if (!locked && !cell.readOnly && !editing) {
                            setEdit({ row, col, text: cell.editValue ?? cell.value });
                            event.currentTarget.select();
                          }
                        }}
                        onChange={(event) => {
                          setInvalid(undefined);
                          const input = event.currentTarget;
                          const raw = input.value;
                          const plain = raw.replace(/,/g, "");
                          if (!cell.numeric || !/^\d*(?:\.\d*)?$/.test(plain)) {
                            setEdit({ row, col, text: raw });
                            return;
                          }
                          const [whole, decimals] = plain.split(".");
                          const text =
                            whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
                            (decimals === undefined ? "" : "." + decimals);
                          const position = raw
                            .slice(0, input.selectionStart ?? raw.length)
                            .replace(/,/g, "").length;
                          setEdit({ row, col, text });
                          requestAnimationFrame(() => {
                            if (document.activeElement !== input) return;
                            let caret = 0,
                              remaining = position;
                            while (caret < text.length && remaining > 0) {
                              if (text[caret] !== ",") remaining--;
                              caret++;
                            }
                            input.setSelectionRange(caret, caret);
                          });
                        }}
                        onBlur={() => {
                          if (editing && !commit()) setEdit(undefined);
                        }}
                        onKeyDown={(event) => key(event, row, col, cell)}
                        onPaste={(event) => paste(event, row, col)}
                      />
                      {!locked && cell.choices && (
                        <datalist id={`choices-${id}-${col}`}>
                          {cell.choices.map((choice) => (
                            <option key={choice} value={choice} />
                          ))}
                        </datalist>
                      )}
                    </td>
                  );
                })}
                {onDelete && !locked && (
                  <td>
                    <button
                      type="button"
                      className="feasibility-delete"
                      aria-label={`Delete row ${row + 1}`}
                      onClick={() => {
                        setEdit(undefined);
                        onDelete(row);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {footer && (
            <tfoot>
              <tr>
                <td colSpan={headers.length + (onDelete && !locked ? 1 : 0)}>{footer}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {error && (
        <p role="alert" className="project-save-error">
          {error}
        </p>
      )}
      {!locked && onAdd && (
        <button type="button" className="projects-secondary feasibility-add" onClick={onAdd}>
          <Plus size={15} /> Add row
        </button>
      )}
    </>
  );
}

import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from "react";
import { api } from "@/data/api";
import "./grid.css";
export type GridColumn<T> = {
  key: string;
  label: string;
  value: (row: T) => string | number;
  render?: (row: T) => ReactNode;
  numeric?: boolean;
  total?: boolean;
  editable?: (row: T) => boolean;
  validate?: (value: string) => boolean;
};
export type GridChange = { id: string; key: string; value: string };
export async function gridWorkbook<T>(columns: GridColumn<T>[], rows: T[]) {
  const Excel = await import("exceljs");
  const book = new (Excel.Workbook ?? Excel.default.Workbook)();
  const sheet = book.addWorksheet("Data");
  sheet.addRow(columns.map((c) => c.label));
  for (const r of rows) sheet.addRow(columns.map((c) => c.value(r)));
  sheet.addRow(
    columns.map((c, i) =>
      c.total ? rows.reduce((s, r) => s + Number(c.value(r) || 0), 0) : i === 0 ? "Total" : "",
    ),
  );
  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(sheet.rowCount).font = { bold: true };
  columns.forEach((c, i) => {
    sheet.getColumn(i + 1).width = 22;
    if (c.numeric) sheet.getColumn(i + 1).numFmt = '#,##0;[Red]-#,##0;"—"';
  });
  return book;
}
export const whole = (n: number) =>
  n === 0 ? "—" : n.toLocaleString("en-PK", { maximumFractionDigits: 0 });
export function DataGrid<T extends { id: string }>({
  name,
  columns,
  rows,
  onChange,
  bulk,
  emptyAction,
  onTotal,
}: {
  name: string;
  columns: GridColumn<T>[];
  rows: T[];
  onChange?: (changes: GridChange[]) => Promise<void> | void;
  bulk?: (ids: string[], clear: () => void) => ReactNode;
  emptyAction?: ReactNode;
  onTotal?: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; direction: number }>();
  const [hidden, setHidden] = useState<string[]>([]);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [user, setUser] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scroll, setScroll] = useState(0);
  const [printing, setPrinting] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState([0, 0]);
  const [anchor, setAnchor] = useState([0, 0]);
  const [edit, setEdit] = useState<{ row: number; col: number; text: string }>();
  const history = useRef<GridChange[][]>([]);
  const saving = useRef(false);
  useEffect(() => {
    let live = true;
    api<{ id: string }>("me")
      .then((u) => {
        if (!live) return;
        setUser(u.id);
        try {
          const saved = JSON.parse(localStorage.getItem(`grid:${u.id}:${name}`) || "{}");
          setHidden(saved.hidden ?? []);
          setWidths(saved.widths ?? {});
        } catch {
          /* Storage is optional. */
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [name]);
  useEffect(() => {
    if (user)
      try {
        localStorage.setItem(`grid:${user}:${name}`, JSON.stringify({ hidden, widths }));
      } catch {
        /* Storage is optional. */
      }
  }, [user, name, hidden, widths]);
  const cols = columns.filter((c) => !hidden.includes(c.key));
  const visible = rows
    .filter(
      (r) =>
        columns.some((c) => String(c.value(r)).toLowerCase().includes(query.toLowerCase())) &&
        columns.every(
          (c) =>
            !filters[c.key] ||
            String(c.value(r)).toLowerCase().includes(filters[c.key].toLowerCase()),
        ),
    )
    .sort((a, b) => {
      const c = columns.find((c) => c.key === sort?.key);
      return c
        ? (c.numeric
            ? Number(c.value(a)) - Number(c.value(b))
            : String(c.value(a)).localeCompare(String(c.value(b)), undefined, { numeric: true })) *
            sort!.direction
        : 0;
    });
  const virtual = visible.length > 200 && !printing;
  const start = virtual ? Math.max(0, Math.floor(scroll / 34) - 8) : 0;
  const end = virtual ? Math.min(visible.length, start + 35) : visible.length;
  function focus(r: number, c: number, extend = false) {
    r = Math.max(0, Math.min(visible.length - 1, r));
    c = Math.max(0, Math.min(cols.length - 1, c));
    setActive([r, c]);
    if (!extend) setAnchor([r, c]);
    if (virtual && (r < start || r >= end)) box.current?.scrollTo({ top: r * 34 });
    requestAnimationFrame(() =>
      box.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)?.focus(),
    );
  }
  async function apply(changes: GridChange[], undo = false) {
    if (!onChange || saving.current || !changes.length) return;
    const previous: GridChange[] = [];
    for (const ch of changes) {
      const row = rows.find((r) => r.id === ch.id);
      const col = cols.find((c) => c.key === ch.key);
      if (!row || !col?.editable?.(row) || (col.validate && !col.validate(ch.value))) {
        setError("Check the values. No cells were changed.");
        return;
      }
      previous.push({ ...ch, value: String(col.value(row)) });
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await onChange(changes);
      if (!undo) history.current.push(previous);
      setEdit(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save. Try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function key(e: KeyboardEvent, r: number, c: number) {
    if (e.key === "Escape" && edit) {
      e.preventDefault();
      e.stopPropagation();
      setEdit(undefined);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      const old = history.current.pop();
      if (old) void apply(old, true);
      return;
    }
    const arrows: Record<string, number[]> = {
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (!edit && arrows[e.key]) {
      e.preventDefault();
      focus(r + arrows[e.key][0], c + arrows[e.key][1], e.shiftKey);
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (edit) void apply([{ id: visible[r].id, key: cols[c].key, value: edit.text }]);
      const delta = e.shiftKey ? -1 : 1;
      if (e.key === "Enter") focus(r + delta, c);
      else {
        const n = r * cols.length + c + delta;
        focus(Math.floor(n / cols.length), ((n % cols.length) + cols.length) % cols.length);
      }
      return;
    }
    if (e.key === "Delete" && !edit) {
      e.preventDefault();
      const changes: GridChange[] = [];
      for (let y = Math.min(anchor[0], r); y <= Math.max(anchor[0], r); y++)
        for (let x = Math.min(anchor[1], c); x <= Math.max(anchor[1], c); x++)
          if (cols[x].editable?.(visible[y]))
            changes.push({ id: visible[y].id, key: cols[x].key, value: "" });
      void apply(changes);
      return;
    }
    if (
      !edit &&
      cols[c].editable?.(visible[r]) &&
      (e.key === "F2" || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey))
    ) {
      e.preventDefault();
      setEdit({ row: r, col: c, text: e.key === "F2" ? String(cols[c].value(visible[r])) : e.key });
    }
  }
  async function download(selectedOnly = false) {
    try {
      const book = await gridWorkbook(
        cols,
        visible.filter((r) => !selectedOnly || selected.includes(r.id)),
      );
      const bytes = await book.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = name + ".xlsx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Export could not be created. Please try again.");
    }
  }
  return (
    <section className="data-grid" aria-label={name}>
      <div className="grid-tools">
        <label>
          Search{" "}
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setScroll(0);
            }}
          />
        </label>
        <details>
          <summary>Columns</summary>
          {columns.map((c) => (
            <label key={c.key}>
              <input
                type="checkbox"
                checked={!hidden.includes(c.key)}
                onChange={() =>
                  setHidden((h) =>
                    h.includes(c.key)
                      ? h.filter((k) => k !== c.key)
                      : cols.length > 1
                        ? [...h, c.key]
                        : h,
                  )
                }
              />
              {c.label}
            </label>
          ))}
        </details>
        <button onClick={() => void download()}>Export to Excel (.xlsx)</button>
        <button
          onClick={() => {
            setPrinting(true);
            setTimeout(() => {
              window.print();
              setPrinting(false);
            }, 100);
          }}
        >
          Print
        </button>
      </div>
      {selected.length > 0 && (
        <div className="grid-bulk">
          {selected.length} selected {bulk?.(selected, () => setSelected([]))}
          <button onClick={() => void download(true)}>Export selected</button>
          <button onClick={() => setSelected([])}>Clear selection</button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Saving…</p>}
      <div ref={box} className="grid-scroll" onScroll={(e) => setScroll(e.currentTarget.scrollTop)}>
        <table role="grid" aria-rowcount={visible.length + 2}>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all visible rows"
                  checked={visible.length > 0 && visible.every((r) => selected.includes(r.id))}
                  onChange={(e) => setSelected(e.target.checked ? visible.map((r) => r.id) : [])}
                />
              </th>
              {cols.map((c) => (
                <th
                  key={c.key}
                  style={{ width: widths[c.key] ?? 160, minWidth: widths[c.key] ?? 160 }}
                  aria-sort={
                    sort?.key === c.key
                      ? sort.direction === 1
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    onClick={() =>
                      setSort({ key: c.key, direction: sort?.key === c.key ? -sort.direction : 1 })
                    }
                  >
                    {c.label}
                  </button>
                  <input
                    aria-label={`Filter ${c.label}`}
                    value={filters[c.key] ?? ""}
                    onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })}
                  />
                  <span
                    role="separator"
                    aria-label={`Resize ${c.label}`}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowRight" || e.key === "ArrowLeft")
                        setWidths((w) => ({
                          ...w,
                          [c.key]: Math.max(
                            80,
                            (w[c.key] ?? 160) + (e.key === "ArrowRight" ? 10 : -10),
                          ),
                        }));
                    }}
                    onPointerDown={(e) => {
                      const x = e.clientX;
                      const w = widths[c.key] ?? 160;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      const el = e.currentTarget;
                      el.onpointermove = (ev) =>
                        setWidths((old) => ({ ...old, [c.key]: Math.max(80, w + ev.clientX - x) }));
                      el.onpointerup = () => {
                        el.onpointermove = null;
                      };
                    }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {virtual && start > 0 && (
              <tr aria-hidden="true">
                <td colSpan={cols.length + 1} style={{ height: start * 34 }} />
              </tr>
            )}
            {visible.slice(start, end).map((row, i) => {
              const r = start + i;
              return (
                <tr key={row.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select row ${r + 1}`}
                      checked={selected.includes(row.id)}
                      onChange={(e) =>
                        setSelected((old) =>
                          e.target.checked ? [...old, row.id] : old.filter((id) => id !== row.id),
                        )
                      }
                    />
                  </td>
                  {cols.map((c, x) => {
                    const editing = edit?.row === r && edit.col === x;
                    const chosen =
                      r >= Math.min(active[0], anchor[0]) &&
                      r <= Math.max(active[0], anchor[0]) &&
                      x >= Math.min(active[1], anchor[1]) &&
                      x <= Math.max(active[1], anchor[1]);
                    return (
                      <td
                        key={c.key}
                        data-cell={`${r}:${x}`}
                        tabIndex={active[0] === r && active[1] === x ? 0 : -1}
                        className={`${c.numeric ? "numeric" : ""} ${Number(c.value(row)) < 0 ? "negative" : ""} ${chosen ? "grid-selected" : ""}`}
                        onClick={(e) => focus(r, x, e.shiftKey)}
                        onDoubleClick={() => {
                          if (c.editable?.(row))
                            setEdit({ row: r, col: x, text: String(c.value(row)) });
                        }}
                        onKeyDown={(e) => key(e, r, x)}
                        onCopy={(e) => {
                          if (editing) return;
                          e.preventDefault();
                          e.clipboardData.setData(
                            "text/plain",
                            visible
                              .slice(
                                Math.min(anchor[0], active[0]),
                                Math.max(anchor[0], active[0]) + 1,
                              )
                              .map((row) =>
                                cols
                                  .slice(
                                    Math.min(anchor[1], active[1]),
                                    Math.max(anchor[1], active[1]) + 1,
                                  )
                                  .map((c) => c.value(row))
                                  .join("\t"),
                              )
                              .join("\n"),
                          );
                        }}
                        onPaste={(e) => {
                          e.preventDefault();
                          const changes: GridChange[] = [];
                          e.clipboardData
                            .getData("text/plain")
                            .replace(/\r/g, "")
                            .replace(/\n$/, "")
                            .split("\n")
                            .forEach((line, dy) =>
                              line.split("\t").forEach((value, dx) => {
                                const rr = visible[r + dy],
                                  cc = cols[x + dx];
                                if (rr && cc?.editable?.(rr))
                                  changes.push({ id: rr.id, key: cc.key, value });
                              }),
                            );
                          void apply(changes);
                        }}
                      >
                        {editing ? (
                          <input
                            autoFocus
                            aria-label={`Edit ${c.label}`}
                            value={edit.text}
                            onChange={(e) => setEdit({ ...edit, text: e.target.value })}
                            onBlur={() => {
                              if (edit) void apply([{ id: row.id, key: c.key, value: edit.text }]);
                            }}
                          />
                        ) : c.render ? (
                          c.render(row)
                        ) : c.numeric ? (
                          whole(Number(c.value(row)))
                        ) : (
                          c.value(row) || "—"
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {virtual && end < visible.length && (
              <tr aria-hidden="true">
                <td colSpan={cols.length + 1} style={{ height: (visible.length - end) * 34 }} />
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              {cols.map((c) => (
                <td className={c.numeric ? "numeric" : ""} key={c.key}>
                  {c.total ? (
                    onTotal ? (
                      <button onClick={() => onTotal(c.key)}>
                        {whole(visible.reduce((s, r) => s + Number(c.value(r) || 0), 0))}
                      </button>
                    ) : (
                      whole(visible.reduce((s, r) => s + Number(c.value(r) || 0), 0))
                    )
                  ) : (
                    ""
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {!visible.length && <div className="grid-empty">No matching records yet. {emptyAction}</div>}
      <small>
        {visible.length} rows · Arrow keys move · F2 edits · Shift + arrows selects · Ctrl+C /
        Ctrl+V · Ctrl+Z undoes
      </small>
    </section>
  );
}

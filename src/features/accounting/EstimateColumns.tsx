import { useEffect, useState } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { estimateCosts } from "@baloch/shared";
import { api } from "@/data/api";
import type { Row } from "./Grid";

const unitChoices = [
  { value: "Lump Sum", label: "Whole land purchase or fixed-price contract; quantity 1" },
  { value: "kg", label: "Steel and other materials by weight" },
  { value: "tonne", label: "Metric tonne (1,000 kg)" },
  { value: "ft", label: "Wiring, pipes and work measured by length" },
  { value: "m", label: "Metres of wiring, pipes or other materials" },
  { value: "sq ft", label: "Land, flooring, plaster or painting by area" },
  { value: "sq yd", label: "Square yards of land or area work" },
  { value: "sq m", label: "Square metres of area work" },
  { value: "cu ft", label: "Concrete, sand or other materials by volume" },
  { value: "cu m", label: "Cubic metres of materials" },
  { value: "Each", label: "Individual fixtures or items" },
  { value: "Bag", label: "Cement or other bagged material" },
  { value: "Roll", label: "Wire or other rolled material" },
  { value: "Point", label: "Electrical or plumbing points" },
  { value: "Day", label: "Labour or equipment per day" },
  { value: "Hour", label: "Labour or equipment per hour" },
];
const base = [
  { key: "serial", label: "S.No" },
  { key: "item", label: "Item" },
  { key: "unit", label: "Unit" },
  { key: "quantity", label: "Quantity" },
  { key: "minimumCost", label: "Minimum Cost" },
  { key: "maximumCost", label: "Maximum Cost" },
  { key: "notes", label: "Notes" },
];
type Definition = { key: string; label: string };
function UnitCell({ value, node, editable }: ICellRendererParams<Row> & { editable: boolean }) {
  const [custom, setCustom] = useState(false);
  if (!editable) return <>{String(value ?? "")}</>;
  return (
    <div style={{ display: "flex", gap: 4, width: "100%" }}>
      <select
        aria-label="Unit"
        value={custom ? "__custom" : String(value ?? "")}
        onChange={(e) => {
          if (e.target.value === "__custom") setCustom(true);
          else {
            setCustom(false);
            node.setDataValue("unit", e.target.value);
          }
        }}
        style={{ width: "100%", padding: "2px" }}
      >
        <option value="">Choose unit</option>
        {unitChoices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.value}
          </option>
        ))}
        {value && !unitChoices.some((c) => c.value === value) && (
          <option value={String(value)}>{String(value)}</option>
        )}
        <option value="__custom">Custom…</option>
      </select>
      {custom && (
        <input
          aria-label="Custom unit"
          autoFocus
          value={String(value ?? "")}
          onChange={(e) => node.setDataValue("unit", e.target.value)}
          style={{ width: "100%", minWidth: 50, padding: "2px" }}
        />
      )}
    </div>
  );
}
export function useEstimateColumns(projectId: string, editable: boolean, rows: Row[]) {
  const [definitions, setDefinitions] = useState<Definition[]>(base),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    api<{ columns: Definition[] } | null>(`views/estimate-columns-${projectId}`)
      .then((view) => {
        if (active && view?.columns?.length)
          setDefinitions(
            view.columns.map((d) =>
              d.key === "rate"
                ? { key: "minimumCost", label: "Minimum Cost" }
                : d.key === "amount"
                  ? { key: "maximumCost", label: "Maximum Cost" }
                  : d,
            ),
          );
      })
      .catch(() => {
        if (active) setMessage("Column preferences could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  const extras = [...new Set(rows.flatMap((r) => Object.keys((r.custom ?? {}) as object)))]
    .filter((key) => !definitions.some((d) => d.key === key))
    .map((key) => ({ key, label: key }));
  const all = [...definitions, ...extras];
  const columns: ColDef<Row>[] = all.map((d) => ({
    colId: d.key,
    field: d.key.startsWith("custom_") ? undefined : d.key,
    headerName: d.label,
    minWidth: d.key === "serial" ? 65 : 100,
    editable: editable && d.key !== "serial",
    ...(d.key === "unit"
      ? {
          editable: false,
          cellRenderer: UnitCell,
          cellRendererParams: { editable },

          headerTooltip: "Choose a unit for this item, or type your own.",
        }
      : {}),
    ...(d.key === "serial"
      ? { width: 70, flex: 0, valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1 }
      : ["minimumCost", "maximumCost"].includes(d.key)
        ? {
            valueGetter: (p) => {
              try {
                return estimateCosts(p.data ?? {})[d.key as "minimumCost" | "maximumCost"];
              } catch {
                return "Invalid";
              }
            },
          }
        : d.key.startsWith("custom_")
          ? {
              valueGetter: (p) => ((p.data?.custom ?? {}) as Record<string, string>)[d.key] ?? "",
              valueSetter: (p) => {
                if (!p.data) return false;
                p.data.custom = {
                  ...((p.data.custom as object) ?? {}),
                  [d.key]: String(p.newValue ?? ""),
                };
                return true;
              },
            }
          : {}),
  }));
  const controls = (
    <details className="estimate-column-settings">
      <summary>Edit Columns</summary>
      <p>
        Rename headings in your view. Added text-column values are saved with each estimate row.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          const next = all.map((d) => ({
            ...d,
            label: String(data.get(d.key) ?? d.label).trim() || d.label,
          }));
          const added = String(data.get("newColumn") ?? "").trim();
          if (added)
            next.push({ key: "custom_" + crypto.randomUUID().replace(/-/g, ""), label: added });
          try {
            await api(`views/estimate-columns-${projectId}`, "PUT", { columns: next, filters: {} });
            setDefinitions(next);
            (form.elements.namedItem("newColumn") as HTMLInputElement).value = "";
            setMessage("Columns saved");
          } catch (error) {
            setMessage(String(error));
          }
        }}
      >
        {all.map((d) => (
          <label key={d.key}>
            {d.label}
            <input name={d.key} defaultValue={d.label} maxLength={80} />
          </label>
        ))}
        <label>
          New column name
          <input name="newColumn" maxLength={80} placeholder="e.g. Supplier" />
        </label>
        <button type="submit">Apply Columns</button>
      </form>
      {message && <p role="status">{message}</p>}
    </details>
  );
  return { columns, controls };
}

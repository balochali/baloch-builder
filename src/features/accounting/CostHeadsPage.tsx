import { entryError } from "./sheetMessages";
import { useEffect, useState } from "react";
import { costHeadSchema } from "@baloch/shared";
import { api } from "@/data/api";
import { Grid, type Row } from "./Grid";
import { SearchSelectEditor } from "./SearchSelectEditor";
import "./accounting.css";
const empty = (): Row => ({
  code: "",
  name: "",
  parent_id: "",
  default_account_id: "",
  budget_only: false,
  active: true,
  sort_order: 0,
});
export function CostHeadsPage() {
  const [rows, setRows] = useState<Row[]>([]),
    [accounts, setAccounts] = useState<Row[]>([]),
    [draft, setDraft] = useState<Row[]>([empty()]),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([api<Row[]>("cost-heads"), api<Row[]>("accounts")])
      .then(([h, a]) => {
        if (active) {
          setRows(h);
          setAccounts(a.filter((a) => !a.archived));
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [revision]);
  function value(field: string, v: unknown): unknown {
    if (field === "parent_id" || field === "default_account_id") {
      if (!v) return null;
      const found = (field === "parent_id" ? rows : accounts).find(
        (r) => r.id === v || String(r.code).toLowerCase() === String(v).trim().toLowerCase(),
      );
      if (!found)
        throw Error(
          `Choose a valid ${field === "parent_id" ? "parent head" : "default account"} code`,
        );
      return found.id;
    }
    if (["budget_only", "active"].includes(field)) {
      if (v === true || v === "true") return true;
      if (v === false || v === "false") return false;
      throw Error(`${field} must be true or false`);
    }
    if (field === "sort_order") return Number(v);
    return String(v ?? "");
  }
  async function edit(r: Row, field: string, old: unknown) {
    if (r._new || r[field] === old) return;
    setError("");
    try {
      await api(`cost-heads/${r.id}`, "PATCH", { [field]: value(field, r[field]) });
      setRevision((v) => v + 1);
    } catch (e) {
      setError(String(e));
      setRevision((v) => v + 1);
    }
  }
  async function create() {
    setBusy(true);
    setError("");
    const remaining: Row[] = [];
    for (const r of draft.filter((r) => r.code || r.name)) {
      try {
        const body = costHeadSchema.parse(
          Object.fromEntries(Object.keys(empty()).map((k) => [k, value(k, r[k])])),
        );
        await api("cost-heads", "POST", body);
      } catch (e) {
        remaining.push({ ...r, error: entryError(e) });
      }
    }
    setDraft([...remaining, empty()]);
    setRevision((v) => v + 1);
    if (remaining.length) setError("Correct the marked cost head rows");
    setBusy(false);
  }
  const columns = Object.keys(empty()).map((field) => ({
    field,
    editable: !busy,
    headerName: (
      {
        code: "Code",
        name: "Cost Head",
        parent_id: "Parent",
        default_account_id: "Default Account",
        budget_only: "Budget Only",
        active: "Active",
        sort_order: "Order",
      } as Record<string, string>
    )[field],
    hide: field === "sort_order",
    ...(["budget_only", "active"].includes(field) ? { cellDataType: "boolean" } : {}),
    ...(["parent_id", "default_account_id"].includes(field)
      ? {
          cellEditor: SearchSelectEditor,
          cellEditorParams: {
            choices: (field === "parent_id" ? rows.filter((r) => !r.parent_id) : accounts).map(
              (r) => ({ value: String(r.code), label: String(r.name) }),
            ),
          },
        }
      : {}),
  }));
  const visible = rows.map((r) => ({
    ...r,
    parent_id: r.parent_code ?? "",
    default_account_id: r.default_account_code ?? "",
  }));
  return (
    <div className="accounting-workspace">
      <h2>Cost heads</h2>
      <p>
        Cost heads are tags. Their default account only prefills an empty account cell; choose
        another appropriate account when needed.
      </p>
      {error && <p role="alert">{error}</p>}
      <Grid
        screen="cost-heads"
        rows={[
          ...visible,
          ...draft.map((r) => ({ ...r, _new: true, _placeholder: !r.code && !r.name })),
        ]}
        columns={[...columns, { field: "in_use_count", headerName: "In Use", editable: false }]}
        newLabel="New Cost Head"
        onCellChange={(r, f, o) => void edit(r, f, o)}
        onChange={(values) => {
          const next = values.filter((r) => r._new || !r.id).map((r) => ({ ...empty(), ...r }));
          setDraft(
            next.length && !next[next.length - 1].code && !next[next.length - 1].name
              ? next
              : [...next, empty()],
          );
        }}
        onSave={draft.some((r) => r.code || r.name) ? () => void create() : undefined}
        busy={busy}
      />
    </div>
  );
}

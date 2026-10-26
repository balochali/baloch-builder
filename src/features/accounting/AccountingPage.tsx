import { entryError } from "./sheetMessages";
import { useEffect, useState, useCallback, useRef } from "react";
import type { ColDef, ValueFormatterParams } from "ag-grid-community";
import { can, type Permission, formatPKR, defaultSettings } from "@baloch/shared";
import { api } from "@/data/api";
import type { SessionUser } from "@/data/session";
import "./accounting.css";
import { Grid, type Row } from "./Grid";
import { PasswordEditor } from "./PasswordEditor";
import { VoucherEditor } from "./VoucherEditor";

const fields = (names: string[], editable = false): ColDef<Row>[] =>
  names.map((field) => ({ field, editable, headerName: field.replace(/_/g, " ") }));
const menus: [string, string, Permission][] = [
  ["projects", "Projects", "projects"],
  ["vouchers", "Vouchers", "ledger"],
  ["journal", "General journal", "ledger"],
  ["trial-balance", "Trial Balance", "ledger"],
  ["accounts", "Chart of accounts", "accounts"],
  ["periods", "Fiscal periods", "periods"],
  ["users", "Users and roles", "users"],
  ["assignments", "Project assignments", "users"],
  ["audit", "Audit log", "audit"],
  ["settings", "Settings", "settings"],
];
const schema: Record<string, string[]> = {
  projects: ["code", "name", "archived"],
  accounts: ["code", "name", "type", "normalBalance", "parentId", "isCashBank", "archived"],
  periods: ["month", "locked"],
  users: ["email", "role", "active"],
  assignments: ["project_id", "user_id", "active"],
  vouchers: ["number", "date", "type", "narration", "status", "id"],
  journal: [
    "date",
    "number",
    "code",
    "name",
    "project",
    "debit",
    "credit",
    "difference",
    "narration",
  ],
  "trial-balance": [
    "code",
    "name",
    "type",
    "movement_debit",
    "movement_credit",
    "debit",
    "credit",
    "difference",
  ],
  audit: ["created_at", "actor_id", "action", "entity", "entity_id", "old_value", "new_value"],
};
const blank: Record<string, Row> = {
  projects: { code: "", name: "", archived: false },
  accounts: {
    code: "",
    name: "",
    type: "asset",
    normalBalance: "debit",
    parentId: "",
    isCashBank: false,
  },
  periods: { month: "", locked: false },
  users: { email: "", role: "accountant", password: "" },
  assignments: { project_id: "", user_id: "", active: true },
};
const bool = (v: unknown) => v === true || v === "true";
function prepare(screen: string, r: Row, existing = false): Row {
  if (screen === "projects") return { code: r.code, name: r.name, archived: bool(r.archived) };
  if (screen === "accounts")
    return existing
      ? { name: r.name, archived: bool(r.archived) }
      : {
          code: r.code,
          name: r.name,
          type: r.type,
          normalBalance: r.normalBalance,
          parentId: r.parentId || null,
          isCashBank: bool(r.isCashBank),
        };
  if (screen === "periods")
    return existing ? { locked: bool(r.locked) } : { month: r.month, locked: bool(r.locked) };
  if (screen === "users")
    return existing
      ? { role: r.role, active: bool(r.active) }
      : { email: r.email, password: r.password, role: r.role };
  return { projectId: r.project_id, userId: r.user_id, active: bool(r.active) };
}
const reportTotals = (rows: Row[]) => {
  let debit = 0n,
    credit = 0n;
  for (const r of rows) {
    debit += BigInt(String(r.debit ?? "0"));
    credit += BigInt(String(r.credit ?? "0"));
  }
  return {
    name: "TOTAL",
    debit: debit.toString(),
    credit: credit.toString(),
    difference: (debit - credit).toString(),
    _unbalanced: debit !== credit,
  };
};
export function AccountingPage({ screen, user }: { screen: string; user: SessionUser }) {
  const [rows, setRows] = useState<Row[]>([]);
  const originalRows = useRef<Row[]>([]);
  const [users, setUsers] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Row[]>([{ ...blank[screen] }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [voucher, setVoucher] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [filters, setFilters] = useState({ projectId: "", from: "", to: "" });
  const [projects, setProjects] = useState<Row[]>([]);
  const [twoFactor, setTwoFactor] = useState(false);
  const [security, setSecurity] = useState<Row[]>([{ password: "", token: "", secret: "" }]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    if (user.role === "admin")
      api<Row[]>("users")
        .then((v) => {
          if (active) setUsers(v);
        })
        .catch(() => {});
    api<Row[]>("projects")
      .then((v) => {
        if (active) setProjects(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user, revision]);
  const load = useCallback(async (): Promise<Row[] | undefined> => {
    if (!user) return;
    const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    const data = await api<Row[] | Record<string, unknown>>(
      screen + (["journal", "trial-balance"].includes(screen) ? `?${query}` : ""),
    );
    return screen === "settings"
      ? Object.entries(data).map(([key, value]) => ({ key, value: String(value) }))
      : (data as Row[]).map((r) =>
          Object.fromEntries(
            Object.entries(r).map(([k, v]) => [
              k,
              typeof v === "object" && v !== null ? JSON.stringify(v) : v,
            ]),
          ),
        );
  }, [user, screen, filters]);
  useEffect(() => {
    let active = true;
    load()
      .then((data) => {
        if (active && data) {
          originalRows.current = structuredClone(data);
          setRows(data);
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [load, revision]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const editable =
    ["projects", "accounts", "periods", "users", "assignments"].includes(screen) &&
    (screen !== "projects" || user.role === "admin");
  const columns =
    screen === "settings"
      ? fields(["key", "value"]).map((c) => ({ ...c, editable: c.field === "value" }))
      : fields(schema[screen] ?? []).map((c) => ({
          ...c,
          ...(screen === "assignments" && ["project_id", "user_id"].includes(c.field!)
            ? {
                cellEditor: "agSelectCellEditor",
                cellEditorParams: {
                  values: (c.field === "project_id" ? projects : users).map((r) => r.id),
                },
              }
            : {}),
          editable:
            editable &&
            (screen === "accounts"
              ? ["name", "archived"].includes(c.field!)
              : screen === "users"
                ? ["role", "active"].includes(c.field!)
                : screen === "periods"
                  ? c.field === "locked"
                  : true),
          valueFormatter: [
            "debit",
            "credit",
            "difference",
            "movement_debit",
            "movement_credit",
          ].includes(c.field!)
            ? (p: ValueFormatterParams<Row>) => formatPKR(BigInt(String(p.value ?? "0")))
            : undefined,
        }));
  const isDraftTouched = (row: Row) =>
    JSON.stringify(prepare(screen, row)) !== JSON.stringify(prepare(screen, blank[screen]));
  const allColumns: ColDef<Row>[] = columns.map((c) => ({
    ...c,
    headerName:
      (
        {
          name: "Account Name",
          normalBalance: "Normal Balance",
          parentId: "Parent",
          isCashBank: "Cash / Bank",
          email: "Email / Username",
          month: "Month",
        } as Record<string, string>
      )[c.field ?? ""] ?? c.headerName,
    hide: screen === "accounts" && ["parentId", "isCashBank"].includes(c.field ?? ""),
    editable: (p) => !busy && (p.data?._new ? editable : Boolean(c.editable)),
    ...(["active", "archived", "locked", "isCashBank"].includes(c.field ?? "")
      ? { cellDataType: "boolean" }
      : {}),
    ...(c.field === "role"
      ? {
          cellEditor: "agSelectCellEditor",
          cellEditorParams: { values: ["admin", "accountant", "sales", "construction"] },
        }
      : {}),
    ...(c.field === "type" && screen === "accounts"
      ? {
          cellEditor: "agSelectCellEditor",
          cellEditorParams: { values: ["asset", "liability", "equity", "revenue", "expense"] },
        }
      : {}),
    ...(c.field === "normalBalance"
      ? { cellEditor: "agSelectCellEditor", cellEditorParams: { values: ["debit", "credit"] } }
      : {}),
  }));
  if (screen === "users")
    allColumns.push({
      field: "password",
      headerName: "Initial Password",
      editable: (p) => Boolean(p.data?._new) && !busy,
      cellEditor: PasswordEditor,
      valueFormatter: (p) => (p.value ? "••••••••" : ""),
    });
  async function saveSheet() {
    if (screen === "settings") {
      const value = { ...defaultSettings } as Record<string, unknown>;
      for (const r of rows) {
        const key = String(r.key),
          original = value[key];
        value[key] =
          typeof original === "boolean"
            ? bool(r.value)
            : typeof original === "number"
              ? Number(r.value)
              : String(r.value);
      }
      await api("settings", "PUT", value);
      setRevision((v) => v + 1);
      return;
    }
    const failedExisting: Row[] = [],
      remaining: Row[] = [];
    for (const row of rows.filter(
      (r) =>
        JSON.stringify(prepare(screen, r, true)) !==
        JSON.stringify(
          prepare(screen, originalRows.current.find((o) => o.id === r.id) ?? {}, true),
        ),
    )) {
      try {
        await api(
          screen === "assignments" ? "assignments" : screen + "/" + row.id,
          screen === "assignments" ? "POST" : "PATCH",
          prepare(screen, row, true),
        );
      } catch (e) {
        failedExisting.push({ ...row, error: entryError(e) });
      }
    }
    for (const row of draft.filter(isDraftTouched)) {
      try {
        await api(screen, "POST", prepare(screen, row));
      } catch (e) {
        remaining.push({ ...row, error: entryError(e) });
      }
    }
    const fresh = await load();
    if (fresh) {
      originalRows.current = structuredClone(fresh);
      setRows(fresh.map((r) => failedExisting.find((f) => f.id === r.id) ?? r));
    }
    setDraft([...remaining, { ...blank[screen] }]);
    if (remaining.length || failedExisting.length)
      throw Error("Correct the highlighted rows and save again");
  }
  return (
    <>
      <div className="accounting-workspace">
        {can(user.role, "ledger") && (
          <button onClick={() => setTwoFactor((v) => !v)}>Two-factor setup</button>
        )}

        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {twoFactor && (
          <section>
            <h2>Two-factor setup</h2>
            <Grid
              short
              screen="security"
              rows={security}
              onChange={setSecurity}
              columns={[
                {
                  field: "password",
                  editable: true,
                  valueFormatter: () => "••••••••",
                  cellEditor: PasswordEditor,
                },
                { field: "token", editable: true },
                { field: "secret" },
              ]}
            />
            <button
              onClick={() =>
                run(async () => {
                  const result = await api<{ secret: string }>("totp/enroll", "POST", {
                    password: security[0].password,
                  });
                  setSecurity([{ password: "", token: "", secret: result.secret }]);
                })
              }
            >
              Generate secret
            </button>
            <button
              onClick={() =>
                run(async () => {
                  await api("totp/confirm", "POST", { token: security[0].token });
                  setSecurity([{ password: "", token: "", secret: "" }]);
                  setTwoFactor(false);
                })
              }
            >
              Confirm code
            </button>
          </section>
        )}
        <h2>{menus.find(([k]) => k === screen)?.[1]}</h2>
        {["journal", "trial-balance"].includes(screen) && (
          <div className="toolbar">
            <label>
              Project
              <select
                value={filters.projectId}
                onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={String(p.id)} value={String(p.id)}>
                    {String(p.name)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              From
              <input
                type="date"
                value={filters.from}
                onChange={(e) => setFilters({ ...filters, from: e.target.value })}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              />
            </label>
          </div>
        )}
        {screen === "vouchers" && !voucher && (
          <div className="toolbar">
            <button onClick={() => setVoucher("new")}>New voucher</button>
            <small>
              Double-click a row or press Enter to open. Payments remain blocked until Phase 2.
            </small>
          </div>
        )}
        {screen === "vouchers" && voucher && (
          <button onClick={() => setVoucher(null)}>← Back to Vouchers</button>
        )}
        {!(screen === "vouchers" && voucher) && (
          <Grid
            key={screen + "-" + user.id}
            screen={screen}
            rows={[
              ...rows,
              ...(editable
                ? draft.map((r) => ({ ...r, _new: true, _placeholder: !isDraftTouched(r) }))
                : []),
            ]}
            columns={allColumns}
            newLabel={
              editable
                ? ((
                    {
                      accounts: "New Account",
                      periods: "New Period",
                      users: "New User",
                      assignments: "New Assignment",
                    } as Record<string, string>
                  )[screen] ?? "New Row")
                : undefined
            }
            onChange={
              editable || screen === "settings"
                ? (values) => {
                    setRows(values.filter((r) => (!r._new && r.id) || screen === "settings"));
                    if (editable) {
                      const next = values
                        .filter((r) => r._new || !r.id)
                        .map((r) => ({ ...blank[screen], ...r }));
                      setDraft(
                        next.length && !isDraftTouched(next[next.length - 1])
                          ? next
                          : [...next, { ...blank[screen] }],
                      );
                    }
                  }
                : undefined
            }
            onSave={editable || screen === "settings" ? () => void run(saveSheet) : undefined}
            busy={busy}
            onSelect={screen === "vouchers" ? (r) => setVoucher(String(r.id)) : undefined}
            totals={["journal", "trial-balance"].includes(screen) ? reportTotals : undefined}
          />
        )}
        {screen === "vouchers" && voucher && (
          <VoucherEditor
            key={voucher}
            id={voucher}
            onSaved={(id) => {
              setVoucher(id);
              setRevision((v) => v + 1);
            }}
          />
        )}

        <footer>
          PKR · amounts displayed in rupees and paisa · F2 edit · Tab/Enter navigate · Esc cancel
          edit · paste tab-separated Excel rows into editable grids
        </footer>
      </div>
    </>
  );
}

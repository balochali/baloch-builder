import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatPKR } from "@baloch/shared";
import { api } from "@/data/api";
import { Grid, type Row } from "./Grid";
import { projectSummary } from "./projectSummary";
import "./accounting.css";

export const workspaceSections = {
  land: "Lands",
  "personal-expense": "Personal Expenses",
  "credit-udhaar": "Udhaar",
  "personal-deposit": "Personal Deposit",
  "bank/personal": "Bank · Personal Account",
  "bank/builder": "Bank · Builder Account",
} as const;
export type WorkspaceSectionName = keyof typeof workspaceSections;
export function WorkspaceSection({ section }: { section: WorkspaceSectionName }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [account, setAccount] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const land = section === "land";
  const bank = section.startsWith("bank/");
  useEffect(() => {
    let active = true;
    const request = land
      ? api<Row[]>("projects?includeArchived=false").then((r) => [r, []] as [Row[], Row[]])
      : Promise.all([api<Row[]>("journal"), api<Row[]>("accounts")]);
    request
      .then(([records, choices]) => {
        if (active) {
          setRows(records);
          setAccounts(choices);
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [land]);
  const choices = accounts.filter(
    (a) =>
      !a.archived &&
      (bank ? a.isCashBank : section === "personal-expense" ? a.type === "expense" : true),
  );
  const visible = land ? rows : account ? rows.filter((r) => r.code === account) : [];
  return (
    <div className="accounting-workspace">
      <h2>{workspaceSections[section]}</h2>
      {bank && (
        <nav aria-label="Bank categories">
          <Link to="/bank/personal">Personal Account</Link>
          {" · "}
          <Link to="/bank/builder">Builder Account</Link>
        </nav>
      )}
      <p className="sheet-hint">
        {land
          ? "Land areas recorded in your project profiles. Open a row to edit its project. Purchase transactions are not yet recorded in a separate land register."
          : "Select an existing account to review its posted entries. This selection is a viewing filter; it does not classify or move records."}
      </p>
      {!land && (
        <>
          <label>
            Account to view{" "}
            <select value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">Choose an account…</option>
              {choices.map((a) => (
                <option key={String(a.id)} value={String(a.code)}>
                  {String(a.code)} — {String(a.name)}
                </option>
              ))}
            </select>
          </label>
          <div>
            <Link to="/accounts">Manage accounts</Link>
            {" · "}
            <Link to="/vouchers">Enter a payment or receipt</Link>
          </div>
          <p className="sheet-hint">
            Dedicated personal/builder classification and separate personal entry forms are not
            configured yet. Existing voucher entry still requires a project.
          </p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">Loading records…</p>
      ) : (
        <Grid
          screen={"workspace-" + section.replace("/", "-")}
          rows={visible}
          emptyMessage={
            land
              ? "No projects yet. Create a project and enter its land area."
              : account
                ? "No posted entries for this account."
                : "Choose an account above to see its entries and totals."
          }
          onSelect={land ? (row) => navigate("/projects/" + row.id) : undefined}
          columns={
            land
              ? [
                  { field: "code", headerName: "Code" },
                  { field: "name", headerName: "Project Name" },
                  { field: "city", headerName: "City" },
                  { field: "land_area_sqft", headerName: "Land Area sq ft" },
                  { field: "address", headerName: "Address" },
                ]
              : [
                  { field: "date", headerName: "Date" },
                  { field: "number", headerName: "Voucher No" },
                  { field: "project", headerName: "Project" },
                  { field: "narration", headerName: "Description" },
                  ...(["debit", "credit"] as const).map((field) => ({
                    field,
                    headerName: field === "debit" ? "Debit" : "Credit",
                    valueFormatter: (p: { value: unknown }) =>
                      formatPKR(BigInt(String(p.value ?? "0"))),
                  })),
                ]
          }
          summary={(filtered) => {
            if (land)
              return (
                <>
                  <span className="sheet-summary-label">Visible project land records</span>
                  <span>
                    Land Area (sq ft)
                    <strong>
                      {
                        projectSummary(
                          filtered.map((row) => ({
                            ...row,
                            saleable_area_sqft: row.land_area_sqft,
                          })),
                        ).area
                      }
                    </strong>
                  </span>
                  <span>
                    Projects<strong>{filtered.length}</strong>
                  </span>
                </>
              );
            const debit = filtered.reduce((sum, r) => sum + BigInt(String(r.debit ?? "0")), 0n);
            const credit = filtered.reduce((sum, r) => sum + BigInt(String(r.credit ?? "0")), 0n);
            return (
              <>
                <span className="sheet-summary-label">
                  Visible posted entries · {filtered.length}
                </span>
                <span>
                  Total Debit<strong>{formatPKR(debit)}</strong>
                </span>
                <span>
                  Total Credit<strong>{formatPKR(credit)}</strong>
                </span>
                <span>
                  Net Debit − Credit<strong>{formatPKR(debit - credit)}</strong>
                </span>
              </>
            );
          }}
        />
      )}
    </div>
  );
}

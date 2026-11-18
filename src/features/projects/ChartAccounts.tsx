import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AccountRow } from "@baloch/shared";
import { api } from "@/data/api";
import { DataGrid } from "@/components/grid/DataGrid";
import "./projects.css";
export function ChartAccounts() {
  const [accounts, setAccounts] = useState<AccountRow[]>(),
    [error, setError] = useState(""),
    [closed, setClosed] = useState<string[]>([]);
  const navigate = useNavigate();
  useEffect(() => {
    api<AccountRow[]>("accounts")
      .then(setAccounts)
      .catch((e) => setError(String(e)));
  }, []);
  const groups = ["Asset", "Liability", "Equity", "Revenue", "Cost of Sales", "Expense"];
  const labels: Record<string, string> = {
    Asset: "Assets",
    Liability: "Liabilities",
    Equity: "Equity",
    Revenue: "Revenue",
    Expense: "Expenses",
    "Cost of Sales": "Cost of Sales",
  };
  const rows = groups.flatMap((group) => [
    { id: group, code: "", name: labels[group], class: group, balance: 0, group: true },
    ...(closed.includes(group)
      ? []
      : (accounts ?? [])
          .filter((a) => a.class === group)
          .map((a) => ({ ...a, id: a.code, group: false }))),
  ]);
  return (
    <section className="builder-projects">
      <header className="projects-heading">
        <div>
          <span className="projects-eyebrow">ACCOUNTING SETUP</span>
          <h1>Chart of Accounts</h1>
          <p>Balances calculated from the journal. Open an account to see its entries.</p>
        </div>
      </header>
      {error ? (
        <p role="alert">{error}</p>
      ) : !accounts ? (
        <p>Loading accounts...</p>
      ) : (
        <DataGrid
          name="Chart of Accounts"
          rows={rows}
          columns={[
            {
              key: "code",
              label: "Code",
              value: (r) => r.code,
              render: (r) =>
                r.group ? (
                  <button
                    onClick={() =>
                      setClosed((v) =>
                        v.includes(r.class) ? v.filter((g) => g !== r.class) : [...v, r.class],
                      )
                    }
                    aria-expanded={!closed.includes(r.class)}
                  >
                    {closed.includes(r.class) ? "+" : "−"} {r.name}
                  </button>
                ) : (
                  <Link to={`/ledger?account=${r.code}`}>{r.code}</Link>
                ),
            },
            {
              key: "name",
              label: "Name",
              value: (r) => (r.group ? "" : r.name),
              render: (r) =>
                r.group ? "" : <Link to={`/ledger?account=${r.code}`}>{r.name}</Link>,
            },
            { key: "type", label: "Type", value: (r) => (r.group ? "" : r.class) },
            {
              key: "balance",
              label: "Balance",
              value: (r) => r.balance,
              numeric: true,
              total: true,
              render: (r) =>
                r.group ? (
                  ""
                ) : (
                  <Link to={`/ledger?account=${r.code}`}>
                    {r.balance ? r.balance.toLocaleString("en-PK") : "—"}
                  </Link>
                ),
            },
          ]}
          onTotal={() => navigate("/ledger")}
        />
      )}
    </section>
  );
}

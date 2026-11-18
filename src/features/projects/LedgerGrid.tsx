import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { JournalRow } from "@baloch/shared";
import { api } from "@/data/api";
import { DataGrid, type GridColumn } from "@/components/grid/DataGrid";
export function LedgerGrid({
  lines,
  emptyAction,
}: {
  lines: JournalRow[];
  emptyAction?: ReactNode;
}) {
  const [params]=useSearchParams();
  const [group, setGroup] = useState(true),
    [voided, setVoided] = useState(false),
    [account, setAccount] = useState(
      () => params.get("account") ?? "",
    );
  const voucher = params.get("voucher");
  const all = lines.filter(
    (l) =>
      (voided || (l.status === "posted" && !l.reversalOf)) && (!voucher || l.voucherId === voucher),
  );
  const ordered = all
    .filter((l) => !account || l.accountCode === account)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.voucherId.localeCompare(b.voucherId, undefined, { numeric: true }),
    );
  const rows = ordered.map((l, i) => {
    const running = ordered.slice(0, i + 1).reduce((sum, row) => sum + row.debit - row.credit, 0);
    const first = i === 0 || l.voucherId !== ordered[i - 1].voucherId;
    const balanced =
      all
        .filter((x) => x.voucherId === l.voucherId)
        .reduce((s, x) => s + BigInt(x.debit) - BigInt(x.credit), 0n) === 0n;
    return { ...l, running, first, balanced };
  });
  const columns: GridColumn<(typeof rows)[number]>[] = [
    {
      key: "voucher",
      label: "Voucher no",
      value: (l) => l.voucherId,
      render: (l) => (
        <span className={l.status === "void" ? "sales-void" : ""}>
          {!group || l.first ? l.voucherId : ""}
          {l.first && (
            <small>
              {l.status === "void" ? " Voided" : l.balanced ? " Balanced" : " Unbalanced"}
            </small>
          )}
        </span>
      ),
    },
    { key: "date", label: "Date", value: (l) => l.date },
    {
      key: "account",
      label: "Account",
      value: (l) => l.accountCode + " " + l.accountName,
      render: (l) => (
        <button onClick={() => setAccount(l.accountCode)}>
          {l.accountCode} {l.accountName}
        </button>
      ),
    },
    { key: "party", label: "Party", value: (l) => l.partner || l.party || "" },
    { key: "project", label: "Project", value: (l) => l.projectName || l.projectCode || "" },
    {
      key: "memo",
      label: "Memo",
      value: (l) => (l.first ? l.narration : ""),
      render: (l) => (l.first ? l.narration : ""),
    },
    { key: "debit", label: "Debit", value: (l) => l.debit, numeric: true, total: true },
    { key: "credit", label: "Credit", value: (l) => l.credit, numeric: true, total: true },
    ...(account
      ? [
          {
            key: "running",
            label: "Running balance",
            value: (l: (typeof rows)[number]) => l.running,
            numeric: true,
          },
        ]
      : []),
  ];
  return (
    <section>
      <h2>Transactions</h2>
      <div className="sales-actions">
        <label>
          <input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} />{" "}
          Group by voucher
        </label>
        <label>
          <input type="checkbox" checked={voided} onChange={(e) => setVoided(e.target.checked)} />{" "}
          Show voided
        </label>
        <label>
          Account
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">All accounts</option>
            {[...new Set(lines.map((l) => l.accountCode))].sort().map((code) => (
              <option key={code} value={code}>
                {code} {lines.find((l) => l.accountCode === code)?.accountName}
              </option>
            ))}
          </select>
        </label>
        {account && <button onClick={() => setAccount("")}>Clear account filter</button>}
        <Link to="/accounts">Chart of Accounts</Link>
      </div>
      <DataGrid name="General Journal" columns={columns} rows={rows} emptyAction={emptyAction} />
    </section>
  );
}
export function GlobalLedger() {
  const [params] = useSearchParams();
  const [lines, setLines] = useState<JournalRow[]>(),
    [error, setError] = useState("");
  useEffect(() => {
    api<JournalRow[]>("ledger")
      .then(setLines)
      .catch((e) => setError(String(e)));
  }, []);
  return (
    <section className="builder-projects">
      {lines ? (
        <LedgerGrid key={params.toString()} lines={lines} />
      ) : (
        <p role={error ? "alert" : "status"}>{error || "Loading ledger…"}</p>
      )}
    </section>
  );
}

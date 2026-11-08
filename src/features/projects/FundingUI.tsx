import { Fragment, useState, type ReactNode } from "react";
import { formatPKR } from "./feasibilityFormat";
import { api } from "@/data/api";
import type { JournalRow } from "@baloch/shared";
import "./funding.css";
export function Money({ value }: { value: number }) {
  return (
    <span className="funding-money" title={value.toLocaleString("en-PK") + " PKR"}>
      {formatPKR(value)}
    </span>
  );
}
export function FundingTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="funding-table-scroll">
      <table className="funding-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Metrics({ values }: { values: [string, ReactNode][] }) {
  return (
    <dl className="feasibility-metrics funding-metrics">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function JournalTable({ lines }: { lines: JournalRow[] }) {
  const [group, setGroup] = useState(false);
  const vouchers = group ? [...new Set(lines.map((l) => l.voucherId))] : [];
  const row = (line: JournalRow) => (
    <tr key={line.id} className={line.status === "void" ? "funding-void" : undefined}>
      <td>{line.date}</td>
      <td>
        {line.voucherId}{" "}
        {line.status === "void" ? (
          <span className="project-status">Void</span>
        ) : line.reversalOf ? (
          <span className="project-status">Reversal</span>
        ) : null}
      </td>
      <td>{line.narration}</td>
      <td>
        {line.accountCode} {line.accountName}
      </td>
      <td className="funding-numeric">{line.debit ? <Money value={line.debit} /> : "—"}</td>
      <td className="funding-numeric">{line.credit ? <Money value={line.credit} /> : "—"}</td>
      <td>{line.partner || line.party || "—"}</td>
    </tr>
  );
  return (
    <section className="project-detail-panel">
      <div className="project-section-heading">
        <h2>Transactions</h2>
        <label>
          <input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} />{" "}
          Group by voucher
        </label>
      </div>
      {!lines.length ? (
        <p>No project transactions posted yet.</p>
      ) : (
        <FundingTable
          headers={[
            "Date",
            "Voucher ID",
            "Narration",
            "Account",
            "Debit",
            "Credit",
            "Party / partner",
          ]}
        >
          {group
            ? vouchers.map((id) => (
                <Fragment key={id}>
                  <tr className="funding-band">
                    <th scope="row" colSpan={7}>
                      {id}
                    </th>
                  </tr>
                  {lines.filter((l) => l.voucherId === id).map(row)}
                </Fragment>
              ))
            : lines.map(row)}
        </FundingTable>
      )}
    </section>
  );
}
export async function downloadFundingFile(url: string) {
  const { name, content } = await api<{ name: string; content: string }>(url);
  const objectUrl = URL.createObjectURL(
    new Blob([Uint8Array.from(atob(content), (c) => c.charCodeAt(0))]),
  );
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

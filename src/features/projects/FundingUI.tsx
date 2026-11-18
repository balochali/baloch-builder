import { type ReactNode } from "react";
import { LedgerGrid } from "./LedgerGrid";
import { api } from "@/data/api";
import type { JournalRow } from "@baloch/shared";
import "./funding.css";
export function Money({ value }: { value: number }) {
  return (
    <span className="funding-money" title={value.toLocaleString("en-PK") + " PKR"}>
      {value === 0 ? "—" : value.toLocaleString("en-PK")}
    </span>
  );
}
export function FundingTable({
  headers,
  children,
  className = "",
}: {
  headers: string[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="funding-table-scroll">
      <table className={`funding-table ${className}`}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                scope="col"
                className={
                  ["Amount", "Share", "Debit", "Credit"].includes(h) ? "funding-numeric" : undefined
                }
              >
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
export function JournalTable({
  lines,
  emptyAction,
}: {
  lines: JournalRow[];
  emptyAction?: ReactNode;
}) {
  return <LedgerGrid lines={lines} emptyAction={emptyAction} />;
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

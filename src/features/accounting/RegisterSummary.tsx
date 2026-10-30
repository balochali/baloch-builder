import {
  workbookSchemas,
  estimateCosts,
  workbookData,
  formatPKR,
  parseAmount,
  type WorkbookSheet,
} from "@baloch/shared";
import type { Row } from "./Grid";
export function estimateAmount(row: Row) {
  const qty = String(row.quantity ?? "0");
  if (!/^\d{1,10}(\.\d{1,4})?$/.test(qty)) throw Error("Invalid quantity");
  const [whole, fraction = ""] = qty.split(".");
  return (
    (BigInt(whole + fraction.padEnd(4, "0")) * parseAmount(String(row.rate ?? "0")) + 5000n) /
    10000n
  );
}
export function RegisterSummary({ sheet, rows }: { sheet: WorkbookSheet; rows: Row[] }) {
  const valid = rows.filter(
    (row) => workbookSchemas[sheet].safeParse(workbookData(sheet, row)).success,
  );
  const sum = (field: string) =>
    valid.reduce((total, row) => total + parseAmount(String(row[field] ?? "0")), 0n);
  const money = (label: string, value: bigint) => (
    <span key={label}>
      {label}
      <strong>{formatPKR(value)}</strong>
    </span>
  );
  const count = (label: string, value: number | string) => (
    <span key={label}>
      {label}
      <strong>{value}</strong>
    </span>
  );
  const sold = valid.filter((r) => r.status === "Sold");
  return (
    <>
      <span className="sheet-summary-label">
        Visible rows · includes unsaved edits
        {valid.length !== rows.length ? " · invalid rows excluded" : ""}
      </span>
      {count("Records", valid.length)}
      {sheet === "partners" && (
        <>
          {count(
            "Total Share %",
            String(valid.reduce((n, r) => n + Math.round(Number(r.share) * 10000), 0) / 10000),
          )}
          {money("Agreed", sum("agreed"))}
          {money("Received", sum("received"))}
          {money("Paid Back", sum("paid"))}
          {money("Still Due", sum("agreed") - sum("received"))}
        </>
      )}
      {sheet === "construction" && (
        <>
          {money("Agreed", sum("agreed"))}
          {money("Paid", sum("paid"))}
          {money("Remaining", sum("agreed") - sum("paid"))}
        </>
      )}
      {sheet === "estimate" && (
        <>
          {money(
            "Minimum Cost",
            valid.reduce((n, row) => n + parseAmount(estimateCosts(row).minimumCost), 0n),
          )}
          {money(
            "Maximum Cost",
            valid.reduce((n, row) => n + parseAmount(estimateCosts(row).maximumCost), 0n),
          )}
        </>
      )}
      {sheet === "flats" && (
        <>
          {count("Sold", sold.length)}
          {count("Available", valid.filter((r) => r.status === "Available").length)}
          {count("Reserved", valid.filter((r) => r.status === "Reserved").length)}
          {money(
            "Sold Value",
            sold.reduce((n, r) => n + parseAmount(String(r.price)), 0n),
          )}
          {money("Received", sum("received"))}
          {money(
            "Sold Balance",
            sold.reduce(
              (n, r) => n + parseAmount(String(r.price)) - parseAmount(String(r.received)),
              0n,
            ),
          )}
        </>
      )}
    </>
  );
}

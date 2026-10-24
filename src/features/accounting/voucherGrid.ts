import { parseAmount, formatPKR } from "@baloch/shared";
export type EntryRow = Record<string, unknown>;
export const emptyLine = (): EntryRow => ({
  id: crypto.randomUUID(),
  account: "",
  project: "",
  debit: "",
  credit: "",
  narration: "",
});
export function isBlankLine(row: EntryRow) {
  return ["account", "project", "debit", "credit", "narration"].every(
    (k) => !String(row[k] ?? "").trim(),
  );
}
export function withBlankLine(rows: EntryRow[]) {
  return rows.length && isBlankLine(rows[rows.length - 1]) ? rows : [...rows, emptyLine()];
}
export function entryTotals(rows: EntryRow[]) {
  let debit = 0n,
    credit = 0n,
    invalid = false;
  for (const r of rows.filter((r) => !isBlankLine(r))) {
    try {
      const d = parseAmount(String(r.debit || "0")),
        c = parseAmount(String(r.credit || "0"));
      debit += d;
      credit += c;
      if (d < 0n || c < 0n || d > 0n === c > 0n) invalid = true;
    } catch {
      invalid = true;
    }
  }
  return { debit, credit, difference: debit - credit, invalid };
}
export function entryFooter(rows: EntryRow[]) {
  const sum = entryTotals(rows);
  return {
    account: "TOTAL",
    debit: formatPKR(sum.debit),
    credit: formatPKR(sum.credit),
    difference: sum.invalid ? "Invalid amount" : formatPKR(sum.difference),
    _unbalanced: sum.invalid || sum.difference !== 0n,
  };
}

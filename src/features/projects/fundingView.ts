import {
  accountBalance,
  type AccountRow,
  type Funding,
  type JournalRow,
  type MoneyEntry,
  type Payout,
} from "@baloch/shared";
export const isFunding = (
  entry: MoneyEntry,
): entry is MoneyEntry & { data: Funding & { loanKey?: string } } => entry.direction === "in";
export const isPayout = (entry: MoneyEntry): entry is MoneyEntry & { data: Payout } =>
  entry.direction === "out";
export const validLines = (lines: JournalRow[]) =>
  lines.filter((l) => l.status === "posted" && !l.reversalOf);
export const balance = (lines: JournalRow[], code: string) => accountBalance(code, lines);
export const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
export const partnerTotals = (lines: JournalRow[], partnerId?: string) => {
  const rows = validLines(lines).filter((l) => !partnerId || l.partnerId === partnerId);
  const capital = rows.filter((l) => l.accountCode === "3000");
  return {
    contributed: sum(capital.map((l) => l.credit)),
    returned: sum(capital.map((l) => l.debit)),
    profit: balance(rows, "3100"),
  };
};
export const normalSide = (row: AccountRow) =>
  row.code === "3100" || ["Asset", "Expense", "Cost of Sales"].includes(row.class)
    ? "Debit"
    : "Credit";
export function loanOutstanding(entries: MoneyEntry[], lines: JournalRow[], loanId: string) {
  const vouchers = new Set(
    entries
      .filter(
        (e) =>
          e.status === "posted" &&
          (isFunding(e)
            ? e.data.sourceType === "loan" && (e.data.loanKey ?? e.id) === loanId
            : isPayout(e) && e.data.loanFundingId === loanId && e.data.kind === "loan_principal"),
      )
      .map((e) => e.voucherId),
  );
  return -balance(
    lines.filter((l) => vouchers.has(l.voucherId)),
    "2300",
  );
}
export const bankLabel = (value: string) =>
  value === "company_bank"
    ? "Company bank"
    : value === "company_cash"
      ? "Company cash"
      : "Paid directly";
export const payoutLabels = {
  capital_return: "Return of capital",
  profit_distribution: "Profit distribution",
  loan_principal: "Loan principal repaid",
  loan_markup: "Loan markup paid",
} as const;

export function commitmentFigures(committed: number | null, contributed: number) {
  return committed === null
    ? { pending: 0, extra: contributed }
    : {
        pending: Math.max(0, committed - contributed),
        extra: Math.max(0, contributed - committed),
      };
}

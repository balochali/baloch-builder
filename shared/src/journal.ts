import type { Funding, Payout } from "./funding";
export type PostingLine = {
  accountCode: string;
  debit: number;
  credit: number;
  projectId?: string;
  partnerId?: string;
  partyId?: string;
  memo?: string;
};
export function validatePosting(lines: PostingLine[]) {
  if (
    lines.length < 2 ||
    lines.some(
      (l) =>
        ![l.debit, l.credit].every((n) => Number.isSafeInteger(n) && n >= 0) ||
        l.debit > 0 === l.credit > 0,
    )
  )
    throw new Error("Each journal line needs one positive integer debit or credit.");
  if (lines.reduce((sum, l) => sum + BigInt(l.debit) - BigInt(l.credit), 0n) !== 0n)
    throw new Error("Journal debits and credits must balance.");
}
export function reverseLines(lines: PostingLine[]) {
  return lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit }));
}
export function fundingLines(
  direction: "in" | "out",
  data: Funding | Payout | (Omit<Funding, "sourceType"> & { sourceType: "customer_booking" }),
  projectId: string,
  partyId?: string,
): PostingLine[] {
  const bank = data.account === "company_bank" ? "1010" : "1000";
  const tag = { projectId, partnerId: data.partnerId, partyId, memo: data.notes };
  const other =
    direction === "in"
      ? "sourceType" in data && data.sourceType === "loan"
        ? "2300"
        : "sourceType" in data && data.sourceType === "customer_booking"
          ? "2200"
          : "3000"
      : "kind" in data
        ? {
            capital_return: "3000",
            profit_distribution: "3100",
            loan_principal: "2300",
            loan_markup: "6200",
          }[data.kind]
        : null;
  if (!other) throw new Error("Invalid project money type.");
  return [
    { ...tag, accountCode: direction === "in" ? bank : other, debit: data.amount, credit: 0 },
    { ...tag, accountCode: direction === "in" ? other : bank, debit: 0, credit: data.amount },
  ];
}
type Filter = { projectId?: string; partnerId?: string; partyId?: string };
// Voids and their reversals remain in history as a cancelling pair.
export function accountBalance(
  code: string,
  lines: (PostingLine & { status?: string; reversalOf?: string | null })[],
  filter: Filter = {},
) {
  return lines
    .filter(
      (l) =>
        l.accountCode === code &&
        (l.status === undefined || l.status === "posted") &&
        !l.reversalOf &&
        Object.entries(filter).every(
          ([key, value]) => value === undefined || l[key as keyof Filter] === value,
        ),
    )
    .reduce((sum, l) => sum + l.debit - l.credit, 0);
}

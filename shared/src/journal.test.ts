import { expect, it } from "vitest";
import { accountBalance, fundingLines, reverseLines, validatePosting } from "./journal";
import type { Funding, Payout } from "./funding";

const fields = { date: "2026-11-08", account: "company_bank" as const, refNo: "", notes: "" };
const inflow = (
  sourceType: Funding["sourceType"],
  amount: number,
  account: Funding["account"] = "company_bank",
  partnerId?: string,
) => ({ ...fields, account, sourceType, amount, purpose: "Land" as const, partnerId });
const outflow = (kind: Payout["kind"], amount: number, partnerId?: string) => ({
  ...fields,
  kind,
  amount,
  partnerId,
});
const scenario = [
  fundingLines("in", inflow("partner", 10_000_000, "company_bank", "BR"), "project"),
  fundingLines("in", inflow("owner", 5_000_000, "company_cash", "Owner"), "project"),
  fundingLines("in", inflow("loan", 20_000_000), "project", "lender"),
  fundingLines("out", outflow("capital_return", 2_000_000, "BR"), "project"),
  fundingLines("out", outflow("loan_principal", 5_000_000), "project", "lender"),
  fundingLines("out", outflow("loan_markup", 500_000), "project", "lender"),
];
it("posts the six funding rules to the expected accounts and balances the project", () => {
  expect(scenario.map((lines) => lines.map((l) => l.accountCode))).toEqual([
    ["1010", "3000"],
    ["1000", "3000"],
    ["1010", "2300"],
    ["3000", "1010"],
    ["2300", "1010"],
    ["6200", "1010"],
  ]);
  for (const lines of scenario) validatePosting(lines);
  const lines = scenario.flat();
  expect(
    ["1010", "1000", "3000", "2300", "6200"].map((code) => accountBalance(code, lines)),
  ).toEqual([22_500_000, 5_000_000, -13_000_000, -15_000_000, 500_000]);
  expect(accountBalance("3000", lines, { partnerId: "BR" })).toBe(-8_000_000);
  expect(accountBalance("2300", lines, { projectId: "project", partyId: "lender" })).toBe(
    -15_000_000,
  );
  expect(accountBalance("1010", lines, { projectId: "other" })).toBe(0);
});
it("posts distribution and future booking rules", () => {
  const distribution = fundingLines("out", outflow("profit_distribution", 100, "BR"), "project");
  expect(distribution[0]).toMatchObject({ accountCode: "3100", debit: 100, partnerId: "BR" });
  expect(distribution[1]).toMatchObject({ accountCode: "1010", credit: 100, partnerId: "BR" });
  const booking = fundingLines(
    "in",
    { ...inflow("owner", 100), sourceType: "customer_booking" },
    "project",
    "client",
  );
  expect(booking.map((l) => l.accountCode)).toEqual(["1010", "2200"]);
  validatePosting(distribution);
  validatePosting(booking);
});
it("rejects unbalanced, negative, fractional, zero and two-sided lines", () => {
  const [debit, credit] = scenario[0];
  expect(() => validatePosting([debit, { ...credit, credit: 1 }])).toThrow(/balance/);
  for (const invalid of [
    { ...debit, debit: -1 },
    { ...debit, debit: 1.25 },
    { ...debit, debit: 0 },
    { ...debit, credit: 1 },
  ])
    expect(() => validatePosting([invalid, credit])).toThrow(/positive integer/);
});
it("reverses both sides and omits the void and reversal pair from effective balances", () => {
  const original = scenario[5];
  const reversal = reverseLines(original);
  validatePosting(reversal);
  expect(reversal[0]).toMatchObject({ accountCode: "6200", credit: 500_000, debit: 0 });
  const lines = [
    ...scenario.slice(0, 5).flat(),
    ...original.map((l) => ({ ...l, status: "void" })),
    ...reversal.map((l) => ({ ...l, reversalOf: "JV-0006" })),
  ];
  expect(accountBalance("1010", lines)).toBe(23_000_000);
  expect(accountBalance("6200", lines)).toBe(0);
});

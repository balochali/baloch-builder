import { z } from "zod";
import type { PostingLine } from "./journal";
const id = z.string().uuid();
const amount = z.number().int().positive().max(1e12);
export const landDate = z
  .string()
  .date()
  .refine(
    (value) => Date.parse(value) <= Date.now() + 86400000,
    "Date cannot be more than one day in the future.",
  );
const notes = z.string().trim().max(2000).default("");
export const landSourceTypes = [
  "bank",
  "cash",
  "partner_direct",
  "owner_direct",
  "loan_direct",
] as const;
export const landSourceSchema = z
  .object({
    sourceType: z.enum(landSourceTypes),
    amount,
    partnerId: id.optional(),
    lenderPartyId: id.optional(),
    loanFundingId: id.optional(),
  })
  .superRefine((s, ctx) => {
    if (s.sourceType === "partner_direct" && !s.partnerId)
      ctx.addIssue({ code: "custom", message: "Select a linked partner.", path: ["partnerId"] });
    if (s.sourceType === "loan_direct" && !s.lenderPartyId)
      ctx.addIssue({ code: "custom", message: "Select a lender.", path: ["lenderPartyId"] });
    if (s.partnerId && !["partner_direct", "owner_direct"].includes(s.sourceType))
      ctx.addIssue({ code: "custom", message: "This source does not use a partner." });
    if ((s.lenderPartyId || s.loanFundingId) && s.sourceType !== "loan_direct")
      ctx.addIssue({ code: "custom", message: "This source does not use a loan." });
  });
export const landPurchaseSchema = z.object({
  parcelId: id,
  sellerPartyId: id,
  agreedPrice: amount,
  agreementDate: landDate,
  notes,
  expectedVoucherId: z.string().optional(),
});
export const landPaymentSchema = z.object({
  purchaseId: id,
  paidOn: landDate,
  reference: z.string().max(120).default(""),
  notes,
  sources: z.array(landSourceSchema).min(1).max(30),
  expectedVoucherId: z.string().optional(),
});
export const landCategories = ["registration", "stamp_duty", "broker", "legal", "other"] as const;
export const landCostSchema = z.object({
  purchaseId: id.nullable().optional(),
  category: z.enum(landCategories),
  paidOn: landDate,
  notes,
  source: landSourceSchema,
  expectedVoucherId: z.string().optional(),
});
export const landContributionSchema = z.object({
  parcelId: id,
  agreedValue: amount,
  contributedOn: landDate,
  notes,
});
export type LandSource = z.infer<typeof landSourceSchema>;
export type LandPurchaseInput = z.infer<typeof landPurchaseSchema>;
export type LandPaymentInput = z.infer<typeof landPaymentSchema>;
export type LandCostInput = z.infer<typeof landCostSchema>;
export type LandContributionInput = z.infer<typeof landContributionSchema>;
export const landSourceLabels: Record<LandSource["sourceType"], string> = {
  bank: "Bank",
  cash: "Cash",
  partner_direct: "Partner paid directly",
  owner_direct: "Owner paid directly",
  loan_direct: "Lender paid directly",
};
export const landCategoryLabels: Record<(typeof landCategories)[number], string> = {
  registration: "Registration",
  stamp_duty: "Stamp duty",
  broker: "Broker commission",
  legal: "Legal fees",
  other: "Other",
};
export const splitTotal = (sources: Pick<LandSource, "amount">[]) =>
  sources.reduce((sum, s) => sum + s.amount, 0);
export const landRemaining = (price: number, paid: number) => price - paid;
export function paymentProblem(sources: LandSource[], remaining: number) {
  const total = splitTotal(sources);
  return !sources.length || sources.some((s) => !Number.isSafeInteger(s.amount) || s.amount <= 0)
    ? "Enter a positive whole-rupee amount for every source."
    : total > remaining
      ? `Payment exceeds the remaining amount of PKR ${remaining.toLocaleString("en-PK")}.`
      : "";
}
export function fundingBreakdown(sources: (LandSource & { label?: string })[]) {
  const groups = new Map<
    string,
    { key: string; label: string; amount: number; sourceType: LandSource["sourceType"] }
  >();
  for (const s of sources) {
    const key = [s.sourceType, s.partnerId ?? s.lenderPartyId ?? ""].join(":");
    const row = groups.get(key) ?? {
      key,
      label: s.label ?? landSourceLabels[s.sourceType],
      amount: 0,
      sourceType: s.sourceType,
    };
    row.amount += s.amount;
    groups.set(key, row);
  }
  const total = splitTotal(sources);
  return [...groups.values()].map((s) => ({
    ...s,
    percentage: total ? (s.amount / total) * 100 : 0,
  }));
}
export function landSourceLines(
  sources: LandSource[],
  projectId: string,
  debitAccount: "2010" | "1400",
  sellerId?: string,
): PostingLine[] {
  return sources.flatMap((s) => [
    {
      accountCode: debitAccount,
      debit: s.amount,
      credit: 0,
      projectId,
      partyId: sellerId,
      memo: "Land",
    },
    {
      accountCode: (
        {
          bank: "1010",
          cash: "1000",
          partner_direct: "3000",
          owner_direct: "3000",
          loan_direct: "2300",
        } as const
      )[s.sourceType],
      debit: 0,
      credit: s.amount,
      projectId,
      partnerId: s.partnerId,
      partyId: s.lenderPartyId,
      memo: "Land",
    },
  ]);
}
export type LandPurchase = LandPurchaseInput & {
  id: string;
  voucherId: string;
  status: "posted" | "void";
};
export type LandPayment = LandPaymentInput & {
  id: string;
  voucherId: string;
  status: "posted" | "void";
  amount: number;
};
export type LandCost = LandCostInput & {
  id: string;
  voucherId: string;
  status: "posted" | "void";
  amount: number;
};
export type LandContribution = LandContributionInput & {
  id: string;
  partnerId: string;
  voucherId: string;
  status: "posted" | "void";
};
export type LandFigures = {
  agreedPrice: number;
  totalPaid: number;
  remaining: number;
  relatedCosts: number;
  totalLandCost: number;
  breakdown: ReturnType<typeof fundingBreakdown>;
};
export type LandSheet = {
  purchases: LandPurchase[];
  payments: LandPayment[];
  costs: LandCost[];
  contributions: LandContribution[];
  parcels: ({ id: string } & LandFigures)[];
  totals: LandFigures;
  partners: { id: string; name: string; role: string }[];
  lenders: { id: string; name: string }[];
  sellers: { id: string; name: string }[];
  available: { bank: number; cash: number };
};

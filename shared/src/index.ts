import { dateSchema } from "./validation";
export { dateSchema } from "./validation";
import { z } from "zod";
export * from "./money";
export const roles = ["admin", "accountant", "sales", "construction"] as const;
export const roleSchema = z.enum(roles);
export type Role = z.infer<typeof roleSchema>;
export const permissions = {
  projects: ["admin", "accountant", "sales", "construction"],
  manageProjects: ["admin"],
  costHeads: ["admin", "accountant"],
  readCostHeads: ["admin", "accountant", "construction"],
  users: ["admin"],
  accounts: ["admin", "accountant"],
  ledger: ["admin", "accountant"],
  periods: ["admin", "accountant"],
  audit: ["admin"],
  settings: ["admin"],
} satisfies Record<string, Role[]>;
export type Permission = keyof typeof permissions;
export function can(role: Role, permission: Permission): boolean {
  return (permissions[permission] as readonly string[]).includes(role);
}
export const paisa = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .refine(
    (v) => /^(0|[1-9]\d*)$/.test(v) && BigInt(v) <= 9223372036854775807n,
    "Amount exceeds bigint range",
  );
export const lineSchema = z
  .object({
    accountId: z.string().uuid(),
    projectId: z.string().uuid(),
    debit: paisa,
    credit: paisa,
    narration: z.string().max(1000).default(""),
    partnerId: z.string().uuid().nullable().optional(),
    supplierId: z.string().uuid().nullable().optional(),
    buyerId: z.string().uuid().nullable().optional(),
    unitId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine(
    (l) =>
      /^\d+$/.test(l.debit) &&
      /^\d+$/.test(l.credit) &&
      BigInt(l.debit) > 0n !== BigInt(l.credit) > 0n,
    "Enter debit or credit, not both",
  );
export const voucherSchema = z
  .object({
    date: dateSchema,
    correctionOfId: z.string().uuid().nullable().optional(),
    type: z.enum(["BRV", "BPV", "CRV", "CPV", "JV", "PIV", "SIV"]),
    narration: z.string().max(1000).default(""),
    lines: z.array(lineSchema).min(2).max(500),
  })
  .strict();
export const settingsSchema = z
  .object({
    revenueRecognition: z.literal("handover"),
    costAllocation: z.enum(["saleable_area", "sale_value"]),
    partnerSharing: z.literal("fixed_percentage"),
    commissionTreatment: z.literal("expense"),
    taxHandling: z.literal("out_of_scope"),
    currency: z.literal("PKR"),
    areaUnit: z.literal("sqft"),
    sqftPerMarla: z.string().regex(/^\d+(\.\d+)?$/),
    marlaPerKanal: z.string().regex(/^\d+(\.\d+)?$/),
    fiscalYearStartMonth: z.number().int().min(1).max(12),
    singleAdminSelfApproval: z.boolean(),
    requireReceiptApproval: z.boolean(),
    approvalThresholdPaisa: paisa,
  })
  .strict();
export const defaultSettings: z.infer<typeof settingsSchema> = {
  revenueRecognition: "handover",
  costAllocation: "saleable_area",
  partnerSharing: "fixed_percentage",
  commissionTreatment: "expense",
  taxHandling: "out_of_scope",
  currency: "PKR",
  areaUnit: "sqft",
  sqftPerMarla: "272.25",
  marlaPerKanal: "20",
  fiscalYearStartMonth: 7,
  singleAdminSelfApproval: false,
  requireReceiptApproval: false,
  approvalThresholdPaisa: "0",
};
export type VoucherInput = z.infer<typeof voucherSchema>;
export function totals(lines: { debit: string; credit: string }[]) {
  return lines.reduce(
    (sum, l) => ({ debit: sum.debit + BigInt(l.debit), credit: sum.credit + BigInt(l.credit) }),
    { debit: 0n, credit: 0n },
  );
}
export * from "./projects";
export * from "./costHeads";

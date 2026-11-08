import { z } from "zod";
export const partnerProfile = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.enum(["Owner", "Partner"]),
  status: z.enum(["Active", "Exited"]),
  phone: z.string().max(120),
  email: z.string().email().or(z.literal("")),
  address: z.string().max(500),
  idNumber: z.string().max(120),
  bankDetails: z.string().max(500),
  joinedDate: z.string().date().or(z.literal("")),
  notes: z.string().max(500),
});
export type MasterPartner = z.infer<typeof partnerProfile> & {
  id: string;
  createdAt?: string;
  updatedAt?: string;
};
const common = {
  date: z.string().date(),
  amount: z.number().int().positive().max(1e12),
  account: z.enum(["company_bank", "company_cash"]),
  refNo: z.string().max(120),
  notes: z.string().max(500),
  partnerId: z.string().uuid().optional(),
};
export const moneyIn = z.object({
  ...common,
  sourceType: z.enum(["partner", "owner", "loan"]),
  lenderPartyId: z.string().uuid().optional(),
  purpose: z.enum(["Land", "Construction", "General"]),
  loanTerms: z
    .object({
      loanType: z.enum(["Bank loan", "Personal loan", "Other"]),
      markupPercent: z.number().min(0).max(100).optional(),
      dueDate: z.string().date().or(z.literal("")),
    })
    .optional(),
});
export const moneyOut = z.object({
  ...common,
  kind: z.enum(["capital_return", "profit_distribution", "loan_principal", "loan_markup"]),
  loanFundingId: z.string().uuid().optional(),
});
export type Funding = z.infer<typeof moneyIn>;
export type Payout = z.infer<typeof moneyOut>;
export type MoneyEntry = {
  id: string;
  direction: "in" | "out";
  data: Funding | Payout;
  voucherId: string;
  status: "posted" | "void";
  attachmentId?: string | null;
};
export type JournalRow = {
  id: string;
  voucherId: string;
  date: string;
  narration: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  party?: string;
  partner?: string;
  partnerId?: string;
  status: "posted" | "void";
  type: string;
  reversalOf?: string | null;
};
export type AccountRow = {
  code: string;
  name: string;
  class: string;
  isSystem: boolean;
  isActive: boolean;
  balance: number;
};

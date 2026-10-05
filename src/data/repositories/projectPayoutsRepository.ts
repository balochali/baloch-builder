import { z } from "zod";
import { execute, query } from "@/data/client";
import { newId, now } from "@/data/ids";
import { BankAccountSchema } from "@/domain/bankAccount";
import { PaymentDetailsSchema } from "@/data/repositories/projectPartnersRepository";
import type { Transaction } from "@/domain/types";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Enter a valid payment date");

export const PartnerPayoutSchema = z.object({
  project_id: z.string().uuid(),
  partner_id: z.string().uuid(),
  amount: z.number().int().positive().safe(),
  date,
  purpose: z.enum(["profit", "capital_return"]),
  account_key: BankAccountSchema,
  method: z.enum(["cash", "bank", "digital", "cheque", "other"]),
  reference: z.string().trim().max(120),
  notes: z.string().trim().max(500),
  payment_details: PaymentDetailsSchema.optional(),
});
export type PartnerPayoutInput = z.infer<typeof PartnerPayoutSchema>;
export type PartnerPayout = Transaction & { payout_purpose: "profit" | "capital_return" };

export async function listPartnerPayouts(projectId: string): Promise<PartnerPayout[]> {
  return query<PartnerPayout>(
    `SELECT t.*, COALESCE(json_extract(t.custom, '$.purpose'), 'profit') AS payout_purpose
     FROM transactions t WHERE t.project_id = ? AND t.type = 'partner_payout'
       AND t.direction = 'out' AND t.archived = 0
     ORDER BY t.date DESC, t.created_at DESC`,
    [projectId],
  );
}

export async function addPartnerPayout(input: PartnerPayoutInput): Promise<string> {
  const value = PartnerPayoutSchema.parse(input);
  const partner = await query<{ contact_id: string }>(
    `SELECT p.contact_id FROM partnerships pp
     JOIN partners p ON p.id = pp.partner_id AND p.archived = 0
     WHERE pp.project_id = ? AND pp.partner_id = ? AND pp.archived = 0`,
    [value.project_id, value.partner_id],
  );
  if (!partner[0]) throw new Error("Partner is not part of this project");
  const timestamp = now();
  const id = newId();
  await execute(
    `INSERT INTO transactions
       (id, date, amount, direction, type, method, reference, description, project_id,
        partner_id, contact_id, created_at, updated_at, archived, custom, account_key)
     VALUES (?, ?, ?, 'out', 'partner_payout', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, value.date, value.amount, value.method, value.reference || null,
      value.notes || (value.purpose === "profit" ? "Partner profit payout" : "Partner capital returned"),
      value.project_id, value.partner_id, partner[0].contact_id, timestamp, timestamp,
      JSON.stringify({ purpose: value.purpose, payment_details: value.payment_details }), value.account_key],
  );
  return id;
}

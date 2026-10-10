import { z } from "zod";
import { execute, query } from "@/data/client";
import { newId, now } from "@/data/ids";
import { BankAccountSchema } from "@/domain/bankAccount";

import { PaymentDetailsSchema } from "@/domain/udhaarPaymentDetails";
const details = z
  .string()
  .nullable()
  .optional()
  .superRefine((raw, ctx) => {
    if (!raw) return;
    try {
      PaymentDetailsSchema.parse(JSON.parse(raw));
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Complete the payment recipient and method details",
      });
    }
  });
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a valid calendar date");
const amount = z
  .number()
  .int("Enter whole rupees")
  .positive("Enter an amount greater than zero")
  .safe();
const method = z.enum(["cash", "bank", "digital", "cheque", "other"]);
export const DepositSchema = z
  .object({
    holder_name: z.string().trim().min(1, "Enter who holds your money").max(120),
    phone: z.string().trim().max(40),
    amount,
    deposit_date: date,
    source: z.enum(["savings", "partner", "other"]),
    source_details: z.string().trim().max(500),
    reason: z.string().trim().max(1000),
    account_key: BankAccountSchema,
    method,
    payment_details: details,
  })
  .refine((value) => value.source === "savings" || value.source_details.length > 0, {
    path: ["source_details"],
    message: "Describe the partner payment or other source",
  });
export const DepositReturnSchema = z.object({
  deposit_id: z.string().uuid(),
  amount,
  return_date: date,
  account_key: BankAccountSchema,
  method,
  payment_details: details,
  notes: z.string().trim().max(1000),
});
export type DepositInput = z.infer<typeof DepositSchema>;
export type DepositReturnInput = z.infer<typeof DepositReturnSchema>;
export interface PersonalDeposit extends DepositInput {
  id: string;
  returned_amount: number;
  created_at: string;
}
export interface DepositReturn extends DepositReturnInput {
  id: string;
  created_at: string;
}
export async function listPersonalDeposits() {
  return query<PersonalDeposit>(`SELECT d.*, COALESCE((SELECT SUM(r.amount) FROM deposit_returns r WHERE r.deposit_id = d.id), 0) AS returned_amount
    FROM personal_deposits d ORDER BY d.deposit_date DESC, d.created_at DESC, d.id`);
}
export async function savePersonalDeposit(input: DepositInput, id?: string) {
  const v = DepositSchema.parse(input);
  const values = [
    v.holder_name,
    v.phone,
    v.amount,
    v.deposit_date,
    v.source,
    v.source_details,
    v.reason,
    v.account_key,
    v.method,
    v.payment_details ?? null,
  ];
  const timestamp = now();
  const savedId = id || newId();
  if (id) {
    z.string().uuid().parse(id);
    const result = await execute(
      `UPDATE personal_deposits SET holder_name=?, phone=?, amount=?, deposit_date=?, source=?, source_details=?, reason=?, account_key=?, method=?, payment_details=?, updated_at=? WHERE id=?`,
      [...values, timestamp, id],
    );
    if (!result.rowsAffected)
      throw new Error("This deposit is no longer available. Refresh the page.");
  } else {
    await execute(
      `INSERT INTO personal_deposits (holder_name, phone, amount, deposit_date, source, source_details, reason, account_key, method, payment_details, created_at, updated_at, id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...values, timestamp, timestamp, savedId],
    );
  }
  return savedId;
}
export async function listDepositReturns(id: string) {
  return query<DepositReturn>(
    "SELECT * FROM deposit_returns WHERE deposit_id = ? ORDER BY return_date DESC, created_at DESC",
    [id],
  );
}
export async function addDepositReturn(input: DepositReturnInput) {
  const v = DepositReturnSchema.parse(input);
  const timestamp = now();
  const id = newId();
  await execute(
    `INSERT INTO deposit_returns (id, deposit_id, amount, return_date, account_key, method, notes, payment_details, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      v.deposit_id,
      v.amount,
      v.return_date,
      v.account_key,
      v.method,
      v.notes,
      v.payment_details ?? null,
      timestamp,
      timestamp,
    ],
  );
  return id;
}

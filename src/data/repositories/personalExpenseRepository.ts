import { PaymentDetailsSchema } from "@/domain/udhaarPaymentDetails";
import { BankAccountSchema } from "@/domain/bankAccount";
import { z } from "zod";
import { execute, query } from "@/data/client";
import { newId, now } from "@/data/ids";

export const ExpenseCategories = ["car", "watch", "land", "house", "other"] as const;
export type ExpenseCategory = (typeof ExpenseCategories)[number];

export const PersonalExpenseSchema = z.object({
  account_key: BankAccountSchema.optional(),
  payment_details: PaymentDetailsSchema.optional(),
  category: z.enum(ExpenseCategories),
  item_name: z.string().trim().min(1, "Enter what you purchased").max(120),
  amount: z.number().int().positive("Enter an amount greater than zero").safe(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a purchase date"),
  notes: z.string().trim().max(1000),
});

export type PersonalExpenseInput = z.infer<typeof PersonalExpenseSchema>;
export interface PersonalExpense extends PersonalExpenseInput {
  id: string;
  created_at: string;
}

export async function listPersonalExpenses(): Promise<PersonalExpense[]> {
  const rows = await query<
    Omit<PersonalExpense, "payment_details"> & { payment_details: string | null }
  >(`SELECT payment_details, id, account_key, category, item_name, amount, purchase_date,
    COALESCE(notes, '') AS notes, created_at FROM personal_expenses
    WHERE archived = 0 ORDER BY purchase_date DESC, created_at DESC`);
  return rows.map(({ payment_details, ...row }) => ({
    ...row,
    payment_details: payment_details
      ? PaymentDetailsSchema.parse(JSON.parse(payment_details))
      : undefined,
  }));
}

export async function createPersonalExpense(input: PersonalExpenseInput): Promise<void> {
  const value = PersonalExpenseSchema.parse(input);
  const timestamp = now();
  await execute(
    `INSERT INTO personal_expenses
    (id, category, item_name, amount, purchase_date, notes, created_at, updated_at, account_key, payment_details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      value.category,
      value.item_name,
      value.amount,
      value.purchase_date,
      value.notes || null,
      timestamp,
      timestamp,
      BankAccountSchema.parse(value.account_key),
      value.payment_details ? JSON.stringify(value.payment_details) : null,
    ],
  );
}

export async function updatePersonalExpense(
  id: string,
  input: PersonalExpenseInput,
): Promise<void> {
  const value = PersonalExpenseSchema.parse(input);
  const result = await execute(
    `UPDATE personal_expenses SET category = ?, item_name = ?, amount = ?,
    purchase_date = ?, notes = ?, updated_at = ?, account_key = ?, payment_details = ? WHERE id = ? AND archived = 0`,
    [
      value.category,
      value.item_name,
      value.amount,
      value.purchase_date,
      value.notes || null,
      now(),
      BankAccountSchema.parse(value.account_key),
      value.payment_details ? JSON.stringify(value.payment_details) : null,
      id,
    ],
  );
  if (result.rowsAffected === 0) throw new Error("Purchase not found");
}

export async function archivePersonalExpense(id: string): Promise<void> {
  const result = await execute(
    `UPDATE personal_expenses SET archived = 1, updated_at = ?
    WHERE id = ? AND archived = 0`,
    [now(), id],
  );
  if (result.rowsAffected === 0) throw new Error("Purchase not found");
}

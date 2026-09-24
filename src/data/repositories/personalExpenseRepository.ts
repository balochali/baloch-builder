import { z } from "zod";
import { execute, query } from "@/data/client";
import { newId, now } from "@/data/ids";

export const ExpenseCategories = ["car", "watch", "land", "house", "other"] as const;
export type ExpenseCategory = typeof ExpenseCategories[number];

export const PersonalExpenseSchema = z.object({
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
  return query<PersonalExpense>(`SELECT id, category, item_name, amount, purchase_date,
    COALESCE(notes, '') AS notes, created_at FROM personal_expenses
    WHERE archived = 0 ORDER BY purchase_date DESC, created_at DESC`);
}

export async function createPersonalExpense(input: PersonalExpenseInput): Promise<void> {
  const value = PersonalExpenseSchema.parse(input);
  const timestamp = now();
  await execute(`INSERT INTO personal_expenses
    (id, category, item_name, amount, purchase_date, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [newId(), value.category, value.item_name,
    value.amount, value.purchase_date, value.notes || null, timestamp, timestamp]);
}

export async function updatePersonalExpense(id: string, input: PersonalExpenseInput): Promise<void> {
  const value = PersonalExpenseSchema.parse(input);
  const result = await execute(`UPDATE personal_expenses SET category = ?, item_name = ?, amount = ?,
    purchase_date = ?, notes = ?, updated_at = ? WHERE id = ? AND archived = 0`, [value.category,
    value.item_name, value.amount, value.purchase_date, value.notes || null, now(), id]);
  if (result.rowsAffected === 0) throw new Error("Purchase not found");
}

export async function archivePersonalExpense(id: string): Promise<void> {
  const result = await execute(`UPDATE personal_expenses SET archived = 1, updated_at = ?
    WHERE id = ? AND archived = 0`, [now(), id]);
  if (result.rowsAffected === 0) throw new Error("Purchase not found");
}

import { PaymentDetailsSchema } from "@/domain/udhaarPaymentDetails";
import { BankAccountSchema } from "@/domain/bankAccount";
import { groupUdhaarPeople } from "@/domain/udhaarPeople";
import { z } from "zod";
import { execute, query } from "@/data/client";
import { newId, now } from "@/data/ids";

const rupees = z.number().int().positive().safe();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

export const CreateUdhaarSchema = z
  .object({
    account_key: BankAccountSchema.optional(),
    payment_details: PaymentDetailsSchema.optional(),
    contact_id: z.string().uuid().nullable().optional(),
    borrower_name: z.string().trim().min(1, "Enter the person's name").max(120),
    phone: z.string().trim().max(40),
    amount: rupees,
    given_date: date,
    due_date: date.nullable(),
    notes: z.string().trim().max(1000),
  })
  .refine((value) => !value.due_date || value.due_date >= value.given_date, {
    path: ["due_date"],
    message: "Due date cannot be before the money was given",
  });

export const AddUdhaarPaymentSchema = z.object({
  account_key: BankAccountSchema.optional(),
  payment_details: PaymentDetailsSchema.optional(),
  udhaar_id: z.string().uuid(),
  amount: rupees,
  paid_date: date,
  method: z.enum(["cash", "bank", "digital", "cheque", "other"]),
  notes: z.string().trim().max(500),
});

export type CreateUdhaarInput = z.infer<typeof CreateUdhaarSchema>;
export type AddUdhaarPaymentInput = z.infer<typeof AddUdhaarPaymentSchema>;

export interface Udhaar {
  payment_details?: string | null;
  account_key?: string | null;
  contact_id?: string | null;
  id: string;
  borrower_name: string;
  phone: string | null;
  amount: number;
  given_date: string;
  due_date: string | null;
  notes: string | null;
  paid_amount: number;
  payment_count: number;
  created_at: string;
}

export interface UdhaarPayment {
  payment_details?: string | null;
  payment_group_id?: string | null;
  id: string;
  udhaar_id: string;
  amount: number;
  paid_date: string;
  method: string | null;
  notes: string | null;
}

export async function listUdhaars(): Promise<Udhaar[]> {
  return query<Udhaar>(`SELECT json_extract(u.custom, '$.payment_details') AS payment_details, u.id, u.account_key, u.contact_id, COALESCE(c.name, u.borrower_name) AS borrower_name, CASE WHEN c.id IS NOT NULL THEN c.phone ELSE u.phone END AS phone, u.amount, u.given_date, u.due_date,
    u.notes, u.created_at, COALESCE(SUM(p.amount), 0) AS paid_amount, COUNT(p.id) AS payment_count
    FROM udhaars u LEFT JOIN contacts c ON c.id = u.contact_id LEFT JOIN udhaar_payments p ON p.udhaar_id = u.id AND p.archived = 0
    WHERE u.archived = 0 GROUP BY u.id ORDER BY u.given_date DESC, u.created_at DESC`);
}

export async function listUdhaarPayments(udhaarId: string): Promise<UdhaarPayment[]> {
  return query<UdhaarPayment>(
    `SELECT json_extract(custom, '$.payment_details') AS payment_details, id, udhaar_id, amount, paid_date, method, notes FROM udhaar_payments
    WHERE udhaar_id = ? AND archived = 0 ORDER BY paid_date DESC, created_at DESC`,
    [udhaarId],
  );
}

export async function listAllUdhaarPayments(): Promise<UdhaarPayment[]> {
  return query<UdhaarPayment>(`SELECT json_extract(p.custom, '$.payment_details') AS payment_details, p.id, p.udhaar_id, p.amount, p.paid_date, p.method, p.notes, json_extract(p.custom, '$.payment_group_id') AS payment_group_id
    FROM udhaar_payments p JOIN udhaars u ON u.id = p.udhaar_id
    WHERE p.archived = 0 AND u.archived = 0 ORDER BY p.paid_date ASC, p.created_at ASC`);
}

export async function createUdhaar(input: CreateUdhaarInput): Promise<void> {
  const value = CreateUdhaarSchema.parse(input);
  let borrowerName = value.borrower_name;
  let borrowerPhone: string | null = value.phone || null;
  if (value.contact_id) {
    const contacts = await query<{ name: string; phone: string | null }>(
      "SELECT name, phone FROM contacts WHERE id = ? AND archived = 0",
      [value.contact_id],
    );
    if (!contacts[0])
      throw new Error("This contact is no longer available. Choose another person.");
    borrowerName = contacts[0].name;
    borrowerPhone = contacts[0].phone;
  }
  const timestamp = now();
  await execute(
    `INSERT INTO udhaars
    (id, borrower_name, phone, amount, given_date, due_date, notes, created_at, updated_at, contact_id, account_key, custom)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      borrowerName,
      borrowerPhone,
      value.amount,
      value.given_date,
      value.due_date,
      value.notes || null,
      timestamp,
      timestamp,
      value.contact_id ?? null,
      BankAccountSchema.parse(value.account_key),
      JSON.stringify({
        payment_details: value.account_key === "personal" ? value.payment_details : undefined,
      }),
    ],
  );
}

export async function addUdhaarPayment(input: AddUdhaarPaymentInput): Promise<void> {
  const value = AddUdhaarPaymentSchema.parse(input);
  const rows = await query<{ amount: number; paid_amount: number; given_date: string }>(
    `SELECT u.amount, u.given_date,
    COALESCE((SELECT SUM(p.amount) FROM udhaar_payments p WHERE p.udhaar_id = u.id AND p.archived = 0), 0) AS paid_amount
    FROM udhaars u WHERE u.id = ? AND u.archived = 0`,
    [value.udhaar_id],
  );
  const loan = rows[0];
  if (!loan) throw new Error("Udhaar record not found");
  if (value.paid_date < loan.given_date)
    throw new Error("Repayment date cannot be before the money was given");
  if (value.amount > loan.amount - loan.paid_amount)
    throw new Error("Payment cannot exceed the remaining balance");
  const timestamp = now();
  await execute(
    `INSERT INTO udhaar_payments
    (id, udhaar_id, amount, paid_date, method, notes, created_at, updated_at, account_key, custom)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      value.udhaar_id,
      value.amount,
      value.paid_date,
      value.method,
      value.notes || null,
      timestamp,
      timestamp,
      BankAccountSchema.parse(value.account_key),
      JSON.stringify({
        payment_details: value.account_key === "personal" ? value.payment_details : undefined,
      }),
    ],
  );
}

/** Permanently clear loans and repayments. Contacts are preserved.
 * Migration 009 deletes child repayments in the same atomic SQL statement.
 */
export async function clearAllUdhaarData(): Promise<void> {
  await execute("DELETE FROM udhaars");
}

/** Allocate one person's repayment oldest-first, committing all allocations together. */
export async function addPersonUdhaarPayment(input: AddUdhaarPaymentInput): Promise<void> {
  const value = AddUdhaarPaymentSchema.parse(input);
  const person = groupUdhaarPeople(await listUdhaars()).find((person) =>
    person.loans.some((loan) => loan.id === value.udhaar_id),
  );
  if (!person) throw new Error("Person's Udhaar records were not found.");
  const eligible = person.loans
    .filter((loan) => loan.given_date <= value.paid_date && loan.amount > loan.paid_amount)
    .sort((a, b) => a.given_date.localeCompare(b.given_date) || a.id.localeCompare(b.id));
  const available = eligible.reduce((sum, loan) => sum + loan.amount - loan.paid_amount, 0);
  if (value.amount > available)
    throw new Error("Payment exceeds the person's outstanding balance for this date.");
  let remaining = value.amount;
  const timestamp = now();
  const group = JSON.stringify({
    payment_group_id: newId(),
    payment_details: value.account_key === "personal" ? value.payment_details : undefined,
  });
  const params: unknown[] = [];
  const rows: string[] = [];
  for (const loan of eligible) {
    if (!remaining) break;
    const allocated = Math.min(remaining, loan.amount - loan.paid_amount);
    rows.push("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    params.push(
      newId(),
      loan.id,
      allocated,
      value.paid_date,
      value.method,
      value.notes || null,
      timestamp,
      timestamp,
      group,
      BankAccountSchema.parse(value.account_key),
    );
    remaining -= allocated;
  }
  await execute(
    "INSERT INTO udhaar_payments (id, udhaar_id, amount, paid_date, method, notes, created_at, updated_at, custom, account_key) VALUES " +
      rows.join(", "),
    params,
  );
}

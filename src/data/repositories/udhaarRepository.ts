import { z } from "zod";
import { execute, query } from "@/data/client";
import { newId, now } from "@/data/ids";

const rupees = z.number().int().positive().safe();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

export const CreateUdhaarSchema = z.object({
  borrower_name: z.string().trim().min(1, "Enter the person's name").max(120),
  phone: z.string().trim().max(40),
  amount: rupees,
  given_date: date,
  due_date: date.nullable(),
  notes: z.string().trim().max(1000),
}).refine((value) => !value.due_date || value.due_date >= value.given_date, {
  path: ["due_date"], message: "Due date cannot be before the money was given",
});

export const AddUdhaarPaymentSchema = z.object({
  udhaar_id: z.string().uuid(),
  amount: rupees,
  paid_date: date,
  method: z.enum(["cash", "bank", "cheque", "other"]),
  notes: z.string().trim().max(500),
});

export type CreateUdhaarInput = z.infer<typeof CreateUdhaarSchema>;
export type AddUdhaarPaymentInput = z.infer<typeof AddUdhaarPaymentSchema>;

export interface Udhaar {
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
  id: string;
  udhaar_id: string;
  amount: number;
  paid_date: string;
  method: string | null;
  notes: string | null;
}

export async function listUdhaars(): Promise<Udhaar[]> {
  return query<Udhaar>(`SELECT u.id, u.borrower_name, u.phone, u.amount, u.given_date, u.due_date,
    u.notes, u.created_at, COALESCE(SUM(p.amount), 0) AS paid_amount, COUNT(p.id) AS payment_count
    FROM udhaars u LEFT JOIN udhaar_payments p ON p.udhaar_id = u.id AND p.archived = 0
    WHERE u.archived = 0 GROUP BY u.id ORDER BY u.given_date DESC, u.created_at DESC`);
}

export async function listUdhaarPayments(udhaarId: string): Promise<UdhaarPayment[]> {
  return query<UdhaarPayment>(`SELECT id, udhaar_id, amount, paid_date, method, notes FROM udhaar_payments
    WHERE udhaar_id = ? AND archived = 0 ORDER BY paid_date DESC, created_at DESC`, [udhaarId]);
}

export async function createUdhaar(input: CreateUdhaarInput): Promise<void> {
  const value = CreateUdhaarSchema.parse(input);
  const timestamp = now();
  await execute(`INSERT INTO udhaars
    (id, borrower_name, phone, amount, given_date, due_date, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [newId(), value.borrower_name, value.phone || null,
    value.amount, value.given_date, value.due_date, value.notes || null, timestamp, timestamp]);
}

export async function addUdhaarPayment(input: AddUdhaarPaymentInput): Promise<void> {
  const value = AddUdhaarPaymentSchema.parse(input);
  const rows = await query<{ amount: number; paid_amount: number; given_date: string }>(`SELECT u.amount, u.given_date,
    COALESCE((SELECT SUM(p.amount) FROM udhaar_payments p WHERE p.udhaar_id = u.id AND p.archived = 0), 0) AS paid_amount
    FROM udhaars u WHERE u.id = ? AND u.archived = 0`, [value.udhaar_id]);
  const loan = rows[0];
  if (!loan) throw new Error("Udhaar record not found");
  if (value.paid_date < loan.given_date) throw new Error("Repayment date cannot be before the money was given");
  if (value.amount > loan.amount - loan.paid_amount) throw new Error("Payment cannot exceed the remaining balance");
  const timestamp = now();
  await execute(`INSERT INTO udhaar_payments
    (id, udhaar_id, amount, paid_date, method, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [newId(), value.udhaar_id, value.amount, value.paid_date,
    value.method, value.notes || null, timestamp, timestamp]);
}

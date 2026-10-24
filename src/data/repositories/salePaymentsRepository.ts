import { z } from "zod";
import { query, execute } from "@/data/client";
import { newId, now } from "@/data/ids";
import { BankAccountSchema } from "@/domain/bankAccount";
import { PaymentDetailsSchema, validateMethod } from "./projectPartnersRepository";
import type { Transaction } from "@/domain/types";
export const SalePaymentSchema = z
  .object({
    amount: z.number().int().positive("Enter a payment amount").safe(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => {
        const d = new Date(v + "T00:00:00Z");
        return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
      }, "Choose a valid payment date"),
    account_key: BankAccountSchema,
    method: z.enum(["cash", "bank", "digital", "cheque", "other"]),
    reference: z.string().trim().max(120),
    payment_details: PaymentDetailsSchema,
  })
  .superRefine((v, ctx) => validateMethod(v.method, v.reference, v.payment_details, ctx));
export type SalePaymentInput = z.infer<typeof SalePaymentSchema>;
export interface SalePayment extends Transaction {
  sale_id: string;
}
export function listSalePayments(projectId: string) {
  return query<SalePayment>(
    "SELECT t.*, json_extract(t.custom,'$.sale_id') AS sale_id FROM transactions t JOIN project_sales s ON s.id=json_extract(t.custom,'$.sale_id') AND s.archived=0 WHERE t.project_id=? AND t.type='sale_payment' AND t.direction='in' AND t.archived=0 ORDER BY t.date DESC,t.created_at DESC",
    [projectId],
  );
}
export async function addSalePayment(projectId: string, saleId: string, input: SalePaymentInput) {
  const v = SalePaymentSchema.parse(input);
  const id = newId();
  const timestamp = now();
  await execute(
    "INSERT INTO transactions(id,date,amount,direction,type,method,reference,description,project_id,created_at,updated_at,archived,custom,account_key) VALUES(?,?,?,'in','sale_payment',?,?,'Buyer instalment',?,?,?,0,?,?)",
    [
      id,
      v.date,
      v.amount,
      v.method,
      v.reference,
      projectId,
      timestamp,
      timestamp,
      JSON.stringify({ sale_id: saleId, payment_details: v.payment_details }),
      v.account_key,
    ],
  );
  return {
    id,
    ...v,
    project_id: projectId,
    sale_id: saleId,
    created_at: timestamp,
    updated_at: timestamp,
    archived: 0,
    custom: JSON.stringify({ sale_id: saleId, payment_details: v.payment_details }),
    direction: "in",
    type: "sale_payment",
    description: "Buyer instalment",
    partner_id: null,
    contact_id: null,
    land_id: null,
    receipt_document_id: null,
  } as SalePayment;
}

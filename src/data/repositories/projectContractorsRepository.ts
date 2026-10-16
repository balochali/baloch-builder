import { z } from "zod";
import { execute, query } from "@/data/client";
import { newId, now } from "@/data/ids";
import { BankAccountSchema } from "@/domain/bankAccount";
import type { Transaction } from "@/domain/types";
import { emptyPaymentDetails } from "./projectPartnersRepository";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
  .refine((value) => {
    const parsed = new Date(value + "T00:00:00Z");
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a valid date");
const amount = z.number().int().positive("Enter an amount greater than zero").safe();
export const ContractorSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().trim().min(1, "Enter the thekedar's name").max(120),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(500),
  scope: z.string().trim().min(1, "Describe the agreed construction work").max(1000),
  agreed_amount: amount,
  agreement_date: date,
  notes: z.string().trim().max(1000),
});
export type ContractorInput = z.infer<typeof ContractorSchema>;
export interface ProjectContractor extends ContractorInput {
  id: string;
  paid: number;
}
export const ContractorPaymentSchema = z
  .object({
    project_id: z.string().uuid(),
    contractor_id: z.string().uuid(),
    amount,
    date,
    account_key: BankAccountSchema,
    method: z.enum(["cash", "bank", "digital", "cheque", "other"]),
    reference: z.string().trim().max(120),
    provider: z.string().trim().max(120),
    received_by: z.string().trim().min(1, "Enter who received the payment").max(120),
    notes: z.string().trim().max(500),
  })
  .refine((v) => v.method === "cash" || !!v.provider, {
    path: ["provider"],
    message: "Enter the bank, wallet or payment service",
  });
export type ContractorPaymentInput = z.infer<typeof ContractorPaymentSchema>;

export function listProjectContractors(projectId: string) {
  return query<ProjectContractor>(
    `SELECT c.*, COALESCE((SELECT SUM(t.amount) FROM transactions t
    WHERE t.project_id = c.project_id AND json_extract(t.custom, '$.contractor_id') = c.id
    AND t.type = 'construction_cost' AND t.direction = 'out' AND t.archived = 0), 0) AS paid
    FROM project_contractors c JOIN projects p ON p.id = c.project_id AND p.archived = 0
    WHERE c.project_id = ? ORDER BY c.created_at, c.id`,
    [projectId],
  );
}
export async function saveProjectContractor(input: ContractorInput, id?: string) {
  const v = ContractorSchema.parse(input);
  const savedId = id ?? newId();
  const stamp = now();
  const values = [
    v.name,
    v.phone,
    v.address,
    v.scope,
    v.agreed_amount,
    v.agreement_date,
    v.notes,
    stamp,
  ];
  const result = id
    ? await execute(
        `UPDATE project_contractors SET name=?, phone=?, address=?, scope=?, agreed_amount=?, agreement_date=?, notes=?, updated_at=?
        WHERE id=? AND project_id=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND archived=0)`,
        [...values, id, v.project_id, v.project_id],
      )
    : await execute(
        `INSERT INTO project_contractors(name,phone,address,scope,agreed_amount,agreement_date,notes,updated_at,id,project_id,created_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM projects WHERE id=? AND archived=0)`,
        [...values, savedId, v.project_id, stamp, v.project_id],
      );
  if (result.rowsAffected !== 1)
    throw new Error("Project or thekedar is no longer available. Refresh and try again.");
  return savedId;
}
export function listContractorPayments(projectId: string) {
  return query<Transaction>(
    `SELECT t.* FROM transactions t JOIN project_contractors c
    ON c.id = json_extract(t.custom, '$.contractor_id') AND c.project_id = t.project_id
    WHERE t.project_id=? AND t.type='construction_cost' AND t.direction='out' AND t.archived=0
    ORDER BY t.date DESC, t.created_at DESC`,
    [projectId],
  );
}
export async function addContractorPayment(input: ContractorPaymentInput) {
  const v = ContractorPaymentSchema.parse(input);
  const id = newId();
  const stamp = now();
  const result = await execute(
    `INSERT INTO transactions(id,date,amount,direction,type,method,reference,description,project_id,account_key,custom,created_at,updated_at,archived)
    SELECT ?,?,?,'out','construction_cost',?,?,c.name || ' · ' || ?,c.project_id,?,?,?,?,0 FROM project_contractors c
    JOIN projects p ON p.id=c.project_id AND p.archived=0 WHERE c.id=? AND c.project_id=?`,
    [
      id,
      v.date,
      v.amount,
      v.method,
      v.reference,
      v.notes || "Thekedar construction payment",
      v.account_key,
      JSON.stringify({
        contractor_id: v.contractor_id,
        payment_details: {
          ...emptyPaymentDetails,
          received_by: v.received_by,
          to_bank: v.provider,
          receipt_no: v.reference,
        },
      }),
      stamp,
      stamp,
      v.contractor_id,
      v.project_id,
    ],
  );
  if (result.rowsAffected !== 1)
    throw new Error("Thekedar is no longer available in this project.");
  return id;
}

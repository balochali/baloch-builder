import { z } from "zod";
import { execute, query } from "@/data/client";
import { newId, now } from "@/data/ids";
import type { Transaction } from "@/domain/types";

const rupees = z.number().int().positive().safe();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a payment date")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a valid calendar date");
const text = z.string().trim().max(120);
export const PaymentDetailsSchema = z.object({
  receipt_no: text,
  from_bank: text,
  from_account_name: text,
  from_account_no: text,
  to_bank: text,
  to_account_name: text,
  to_account_no: text,
  cheque_no: text,
  cheque_date: z.union([date, z.literal("")]),
  cheque_payee: text,
  received_by: text,
});
export type PaymentDetails = z.infer<typeof PaymentDetailsSchema>;
export const emptyPaymentDetails: PaymentDetails = {
  receipt_no: "", from_bank: "", from_account_name: "", from_account_no: "",
  to_bank: "", to_account_name: "", to_account_no: "", cheque_no: "",
  cheque_date: "", cheque_payee: "", received_by: "",
};

export function readPaymentDetails(custom: string): PaymentDetails | null {
  try {
    const parsed = PaymentDetailsSchema.safeParse(JSON.parse(custom)?.payment_details);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

function validateMethod(method: "cash" | "bank" | "cheque" | "other", reference: string,
  details: PaymentDetails, ctx: z.RefinementCtx) {
  const required: [keyof PaymentDetails, string][] = method === "bank" ? [
    ["from_bank", "Sender bank is required"], ["from_account_name", "Sender account name is required"],
    ["to_bank", "Receiving bank is required"], ["to_account_name", "Receiving account name is required"],
  ] : method === "cheque" ? [
    ["cheque_no", "Cheque number is required"], ["from_bank", "Issuing bank is required"],
    ["from_account_name", "Account holder is required"], ["cheque_date", "Cheque date is required"],
    ["cheque_payee", "Cheque payee is required"],
  ] : [];
  for (const [key, message] of required) {
    if (!details[key]) ctx.addIssue({ code: "custom", path: ["payment_details", key], message });
  }
  if (method === "bank" && !reference) {
    ctx.addIssue({ code: "custom", path: ["reference"], message: "Transfer reference or transaction ID is required" });
  }
}

export const AddProjectPartnerSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().trim().min(1, "Partner name is required").max(120),
  phone: z.string().trim().min(1, "Mobile number is required").max(30),
  phone2: z.string().trim().max(30),
  address: z.string().trim().max(500),
  notes: z.string().trim().max(2000),
  share_bp: z.number().int().min(1, "Share must be greater than zero").max(10_000, "Share cannot exceed 100%"),
  agreed_contribution: z.number().int().nonnegative().safe().nullable(),
  initial_amount: rupees.nullable(),
  initial_date: date.nullable(),
  initial_method: z.enum(["cash", "bank", "cheque", "other"]),
  initial_reference: z.string().trim().max(120),
  initial_payment_details: PaymentDetailsSchema,
}).superRefine((value, ctx) => {
  if ((value.initial_amount === null) !== (value.initial_date === null)) {
    ctx.addIssue({ code: "custom", path: ["initial_amount"], message: "Enter both the first payment amount and date" });
  }
  if (value.initial_amount !== null) validateMethod(value.initial_method, value.initial_reference, value.initial_payment_details, ctx);
});

export const PartnerContributionSchema = z.object({
  project_id: z.string().uuid(),
  partner_id: z.string().uuid(),
  amount: rupees,
  date,
  method: z.enum(["cash", "bank", "cheque", "other"]),
  reference: z.string().trim().max(120),
  description: z.string().trim().max(500),
  payment_details: PaymentDetailsSchema,
}).superRefine((value, ctx) => validateMethod(value.method, value.reference, value.payment_details, ctx));

export type AddProjectPartnerInput = z.infer<typeof AddProjectPartnerSchema>;
export type PartnerContributionInput = z.infer<typeof PartnerContributionSchema>;

export interface ProjectPartnerRow {
  partnership_id: string;
  partner_id: string;
  contact_id: string;
  name: string;
  phone: string | null;
  phone2: string | null;
  address: string | null;
  notes: string | null;
  share_bp: number;
  agreed_contribution: number | null;
  contributed: number;
}

export interface PartnerOverviewRow extends ProjectPartnerRow {
  project_id: string;
  project_name: string;
  project_code: string | null;
  project_location: string | null;
  project_status: string | null;
  partner_status: string | null;
  partnership_status: string | null;
  created_at: string;
}

export async function listAllProjectPartners(): Promise<PartnerOverviewRow[]> {
  return query<PartnerOverviewRow>(
    `SELECT pp.id AS partnership_id, pp.project_id, pp.created_at,
       pr.name AS project_name, pr.code AS project_code, pr.location AS project_location,
       pr.status AS project_status, p.id AS partner_id, p.status AS partner_status,
       pp.status AS partnership_status, c.id AS contact_id, c.name, c.phone, c.phone2,
       c.address, p.notes, pp.share_bp, pp.agreed_contribution,
       COALESCE((SELECT SUM(t.amount) FROM transactions t
         WHERE t.project_id = pp.project_id AND t.partner_id = p.id
           AND t.type = 'partner_contribution' AND t.direction = 'in' AND t.archived = 0), 0) AS contributed
     FROM partnerships pp
     JOIN projects pr ON pr.id = pp.project_id AND pr.archived = 0
     JOIN partners p ON p.id = pp.partner_id AND p.archived = 0
     JOIN contacts c ON c.id = p.contact_id AND c.archived = 0
     WHERE pp.archived = 0 ORDER BY c.name COLLATE NOCASE, pr.name COLLATE NOCASE, pp.id`,
  );
}

export async function listAllPartnerContributions(): Promise<Transaction[]> {
  return query<Transaction>(
    `SELECT t.* FROM transactions t
     WHERE t.type = 'partner_contribution' AND t.direction = 'in' AND t.archived = 0
       AND EXISTS (SELECT 1 FROM partnerships pp
         JOIN projects pr ON pr.id = pp.project_id AND pr.archived = 0
         JOIN partners p ON p.id = pp.partner_id AND p.archived = 0
         JOIN contacts c ON c.id = p.contact_id AND c.archived = 0
         WHERE pp.project_id = t.project_id AND pp.partner_id = t.partner_id AND pp.archived = 0)
     ORDER BY t.date DESC, t.created_at DESC`,
  );
}

export async function listProjectPartners(projectId: string): Promise<ProjectPartnerRow[]> {
  return query<ProjectPartnerRow>(
    `SELECT pp.id AS partnership_id, p.id AS partner_id, c.id AS contact_id,
       c.name, c.phone, c.phone2, c.address, p.notes, pp.share_bp, pp.agreed_contribution,
       COALESCE((SELECT SUM(t.amount) FROM transactions t
         WHERE t.project_id = pp.project_id AND t.partner_id = p.id
           AND t.type = 'partner_contribution' AND t.direction = 'in' AND t.archived = 0), 0) AS contributed
     FROM partnerships pp
     JOIN partners p ON p.id = pp.partner_id AND p.archived = 0
     JOIN contacts c ON c.id = p.contact_id AND c.archived = 0
     WHERE pp.project_id = ? AND pp.archived = 0 ORDER BY pp.created_at, pp.id`,
    [projectId],
  );
}

export async function listPartnerContributions(projectId: string): Promise<Transaction[]> {
  return query<Transaction>(
    `SELECT * FROM transactions WHERE project_id = ? AND type = 'partner_contribution'
       AND direction = 'in' AND archived = 0 ORDER BY date DESC, created_at DESC`,
    [projectId],
  );
}

async function insertContribution(value: PartnerContributionInput, contactId: string): Promise<void> {
  const timestamp = now();
  await execute(
    `INSERT INTO transactions
       (id, date, amount, direction, type, method, reference, description, project_id,
        partner_id, contact_id, created_at, updated_at, archived, custom)
     VALUES (?, ?, ?, 'in', 'partner_contribution', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [newId(), value.date, value.amount, value.method, value.reference || null,
      value.description || "Partner contribution", value.project_id, value.partner_id,
      contactId, timestamp, timestamp, JSON.stringify({ payment_details: value.payment_details })],
  );
}

export async function addProjectPartner(input: AddProjectPartnerInput): Promise<void> {
  const value = AddProjectPartnerSchema.parse(input);
  const existing = await listProjectPartners(value.project_id);
  if (existing.reduce((total, item) => total + item.share_bp, 0) + value.share_bp > 10_000) {
    throw new Error("Combined partner shares cannot exceed 100%");
  }
  const contactId = newId();
  const partnerId = newId();
  const partnershipId = newId();
  const timestamp = now();
  let contactCreated = false;
  let partnerCreated = false;
  let partnershipCreated = false;
  try {
    await execute(
    `INSERT INTO contacts (id, name, phone, phone2, address, notes, created_at, updated_at, archived, custom)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, '{}')`,
    [contactId, value.name, value.phone, value.phone2 || null, value.address || null,
      value.notes || null, timestamp, timestamp],
    );
    contactCreated = true;
    await execute(
    `INSERT INTO partners (id, contact_id, status, notes, created_at, updated_at, archived, custom)
     VALUES (?, ?, 'active', ?, ?, ?, 0, '{}')`,
    [partnerId, contactId, value.notes || null, timestamp, timestamp],
    );
    partnerCreated = true;
    await execute(
    `INSERT INTO partnerships (id, project_id, partner_id, share_bp, agreed_contribution,
       status, created_at, updated_at, archived, custom)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, 0, '{}')`,
    [partnershipId, value.project_id, partnerId, value.share_bp, value.agreed_contribution,
      timestamp, timestamp],
    );
    partnershipCreated = true;
    if (value.initial_amount !== null && value.initial_date !== null) {
      await insertContribution({ project_id: value.project_id, partner_id: partnerId,
        amount: value.initial_amount, date: value.initial_date, method: value.initial_method,
        reference: value.initial_reference, description: "Initial partner contribution",
        payment_details: value.initial_payment_details }, contactId);
    }
  } catch (cause) {
    // The SQL plugin exposes individual statements, so retire earlier records if a later write fails.
    try {
      if (partnershipCreated) await execute("UPDATE partnerships SET archived = 1, updated_at = ? WHERE id = ?", [now(), partnershipId]);
      if (partnerCreated) await execute("UPDATE partners SET archived = 1, updated_at = ? WHERE id = ?", [now(), partnerId]);
      if (contactCreated) await execute("UPDATE contacts SET archived = 1, updated_at = ? WHERE id = ?", [now(), contactId]);
    } catch (cleanupError) {
      const error = new Error(`Partner save failed, and cleanup also failed: ${String(cleanupError)}`) as Error & { cause?: unknown };
      error.cause = cause;
      throw error;
    }
    throw cause;
  }
}

export async function addPartnerContribution(input: PartnerContributionInput): Promise<void> {
  const value = PartnerContributionSchema.parse(input);
  const rows = await query<{ contact_id: string }>(
    `SELECT p.contact_id FROM partnerships pp JOIN partners p ON p.id = pp.partner_id
     WHERE pp.project_id = ? AND pp.partner_id = ? AND pp.archived = 0 AND p.archived = 0`,
    [value.project_id, value.partner_id],
  );
  if (!rows[0]) throw new Error("Partner is not part of this project");
  await insertContribution(value, rows[0].contact_id);
}

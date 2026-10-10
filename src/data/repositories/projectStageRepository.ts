import { BankAccountSchema } from "@/domain/bankAccount";
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { query } from "@/data/client";
import { newId, now } from "@/data/ids";
import { ProjectStatuses, type ProjectStatus } from "./projectsRepository";
import type { Project } from "@/domain/types";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date");
const amount = z.number().int().positive().safe();

export const LandPaymentDetailsSchema = z.object({
  method: z.enum(["cash", "bank", "digital", "cheque", "other"]),
  paid_to: z.string().trim().max(120),
  provider: z.string().trim().max(120),
  account_name: z.string().trim().max(120),
  account_no: z.string().trim().max(120),
  reference: z.string().trim().max(120),
  cheque_date: z.union([date, z.literal("")]),
});
export type LandPaymentDetails = z.infer<typeof LandPaymentDetailsSchema>;
export const emptyLandPaymentDetails: LandPaymentDetails = {
  method: "cash",
  paid_to: "",
  provider: "",
  account_name: "",
  account_no: "",
  reference: "",
  cheque_date: "",
};

function validateLandPayment(value: LandPaymentDetails | null | undefined, ctx: z.RefinementCtx) {
  if (!value) return;
  if (!value.paid_to)
    ctx.addIssue({
      code: "custom",
      path: ["payment_details", "paid_to"],
      message: "Enter who received the payment",
    });
  if (value.method !== "cash" && !value.provider)
    ctx.addIssue({
      code: "custom",
      path: ["payment_details", "provider"],
      message: "Enter the bank, wallet or payment service",
    });
  if (
    (value.method === "bank" || value.method === "digital" || value.method === "cheque") &&
    !value.reference
  )
    ctx.addIssue({
      code: "custom",
      path: ["payment_details", "reference"],
      message:
        value.method === "cheque" ? "Enter the cheque number" : "Enter the transaction reference",
    });
  if (value.method === "cheque" && !value.cheque_date)
    ctx.addIssue({
      code: "custom",
      path: ["payment_details", "cheque_date"],
      message: "Enter the cheque date",
    });
}

export const LandAcquisitionSchema = z
  .object({
    account_key: BankAccountSchema.optional(),
    title: z.string().trim().min(1, "Enter a name for the land").max(120),
    location: z.string().trim().min(1, "Enter the land location").max(500),
    purchase_date: date,
    area_value: z.number().positive().finite().nullable(),
    area_unit: z.enum(["marla", "kanal", "sqft", "sqyd", "acre"]).nullable(),
    seller_name: z.string().trim().max(120),
    price: amount.nullable(),
    payment_details: LandPaymentDetailsSchema.nullable().optional(),
    notes: z.string().trim().max(1000),
  })
  .refine((value) => (value.area_value === null) === (value.area_unit === null), {
    path: ["area_value"],
    message: "Enter both the land area and its unit",
  })
  .superRefine((value, ctx) => {
    if (value.price !== null) {
      if (!value.account_key)
        ctx.addIssue({
          code: "custom",
          path: ["account_key"],
          message: "Choose the paying account",
        });
      if (!value.payment_details)
        ctx.addIssue({
          code: "custom",
          path: ["payment_details"],
          message: "Enter how the land was paid for",
        });
      validateLandPayment(value.payment_details, ctx);
    }
  });

export type LandAcquisitionInput = z.infer<typeof LandAcquisitionSchema>;
export type ProjectLand = Omit<LandAcquisitionInput, "seller_name"> & {
  id: string;
  seller_name: string;
  status?: string;
};

export async function getProjectLand(projectId: string): Promise<ProjectLand | null> {
  const rows = await query<ProjectLand & { custom: string }>(
    `SELECT id, status, account_key, title, location, purchase_date, area_value, area_unit, price,
    notes, custom FROM land WHERE project_id = ? AND archived = 0 ORDER BY created_at LIMIT 1`,
    [projectId],
  );
  const row = rows[0];
  if (!row) return null;
  let sellerName = "";
  try {
    sellerName = JSON.parse(row.custom)?.seller_name ?? "";
  } catch {
    /* Older records may not have valid custom data. */
  }
  let paymentDetails: LandPaymentDetails | null = null;
  try {
    const parsed = LandPaymentDetailsSchema.safeParse(JSON.parse(row.custom)?.payment_details);
    if (parsed.success) paymentDetails = parsed.data;
  } catch {
    /* Older records may not have payment details. */
  }
  return { ...row, seller_name: sellerName, payment_details: paymentDetails };
}

/** Save stage details and status in one native SQLite transaction. */
export async function saveProjectStage(
  projectId: string,
  status: ProjectStatus,
  land?: LandAcquisitionInput,
): Promise<Project> {
  const validStatus = z.enum(ProjectStatuses).parse(status);
  if (validStatus === "land acquired" && !land) throw new Error("Land details are required");
  const validLand = land ? LandAcquisitionSchema.parse(land) : null;
  if (validLand && validStatus !== "land acquired")
    throw new Error("Land details require the Land acquired status");
  if (validLand?.price != null) BankAccountSchema.parse(validLand.account_key);
  await invoke("save_project_stage", {
    projectId,
    status: validStatus,
    land: validLand,
    landId: newId(),
    timestamp: now(),
  });
  const projects = await query<Project>("SELECT * FROM projects WHERE id = ?", [projectId]);
  if (!projects[0]) throw new Error("Stage was saved but the project could not be reloaded");
  return projects[0];
}

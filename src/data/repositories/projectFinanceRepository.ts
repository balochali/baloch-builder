import { z } from "zod";
import { execute, query } from "@/data/client";
import { newId, now } from "@/data/ids";
import type { ProjectEstimate, Transaction } from "@/domain/types";

const money = z.number().int().nonnegative().safe();

export const EstimateInputSchema = z.object({
  project_id: z.string().uuid(),
  kind: z.enum(["cost", "revenue"]),
  title: z.string().trim().min(1, "Item name is required").max(120),
  details: z.string().trim().max(500),
  minimum_amount: money,
  maximum_amount: money,
}).refine((value) => value.maximum_amount >= value.minimum_amount, {
  path: ["maximum_amount"], message: "Maximum must be at least the minimum",
});

export const ActualCostInputSchema = z.object({
  project_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  amount: z.number().int().positive().safe(),
  description: z.string().trim().min(1, "Description is required").max(500),
  method: z.enum(["cash", "bank", "cheque", "other"]),
  reference: z.string().trim().max(120),
});

export type EstimateInput = z.infer<typeof EstimateInputSchema>;
export type ActualCostInput = z.infer<typeof ActualCostInputSchema>;

export async function listProjectEstimates(projectId: string): Promise<ProjectEstimate[]> {
  return query<ProjectEstimate>(
    `SELECT * FROM project_estimates WHERE project_id = ? AND archived = 0 ORDER BY created_at ASC`,
    [projectId],
  );
}

export async function addProjectEstimate(input: EstimateInput): Promise<ProjectEstimate> {
  const value = EstimateInputSchema.parse(input);
  const id = newId();
  const timestamp = now();
  await execute(
    `INSERT INTO project_estimates
      (id, project_id, kind, title, details, minimum_amount, maximum_amount, created_at, updated_at, archived, custom)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '{}')`,
    [id, value.project_id, value.kind, value.title, value.details || null,
      value.minimum_amount, value.maximum_amount, timestamp, timestamp],
  );
  const rows = await query<ProjectEstimate>(`SELECT * FROM project_estimates WHERE id = ?`, [id]);
  if (!rows[0]) throw new Error("Estimate was saved but could not be loaded");
  return rows[0];
}

export async function updateProjectEstimate(estimateId: string, input: EstimateInput): Promise<ProjectEstimate> {
  const value = EstimateInputSchema.parse(input);
  const result = await execute(
    `UPDATE project_estimates
     SET kind = ?, title = ?, details = ?, minimum_amount = ?, maximum_amount = ?, updated_at = ?
     WHERE id = ? AND project_id = ? AND archived = 0`,
    [value.kind, value.title, value.details || null, value.minimum_amount,
      value.maximum_amount, now(), estimateId, value.project_id],
  );
  if (result.rowsAffected !== 1) throw new Error("Estimate item was not found");
  const rows = await query<ProjectEstimate>(
    `SELECT * FROM project_estimates WHERE id = ? AND project_id = ? AND archived = 0`,
    [estimateId, value.project_id],
  );
  if (!rows[0]) throw new Error("Updated estimate item could not be loaded");
  return rows[0];
}

export async function archiveProjectEstimate(projectId: string, estimateId: string): Promise<void> {
  const result = await execute(
    `UPDATE project_estimates SET archived = 1, updated_at = ?
     WHERE id = ? AND project_id = ? AND archived = 0`,
    [now(), estimateId, projectId],
  );
  if (result.rowsAffected !== 1) throw new Error("Estimate item was not found");
}

export async function listActualProjectCosts(projectId: string): Promise<Transaction[]> {
  return query<Transaction>(
    `SELECT * FROM transactions
     WHERE project_id = ? AND type = 'project_cost' AND direction = 'out' AND archived = 0
     ORDER BY date DESC, created_at DESC`,
    [projectId],
  );
}

export async function addActualProjectCost(input: ActualCostInput): Promise<Transaction> {
  const value = ActualCostInputSchema.parse(input);
  const id = newId();
  const timestamp = now();
  await execute(
    `INSERT INTO transactions
      (id, date, amount, direction, type, method, reference, description, project_id,
       created_at, updated_at, archived, custom)
     VALUES (?, ?, ?, 'out', 'project_cost', ?, ?, ?, ?, ?, ?, 0, '{}')`,
    [id, value.date, value.amount, value.method, value.reference || null,
      value.description, value.project_id, timestamp, timestamp],
  );
  const rows = await query<Transaction>(`SELECT * FROM transactions WHERE id = ?`, [id]);
  if (!rows[0]) throw new Error("Cost was saved but could not be loaded");
  return rows[0];
}

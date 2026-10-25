import { z } from "zod";
import { dateSchema } from "./validation";
export const projectTypes = ["apartments", "commercial", "mixed_use", "plots", "other"] as const;
export const projectStatuses = [
  "planning",
  "land_acquisition",
  "approvals",
  "construction",
  "sales",
  "handover",
  "closed",
] as const;
export type ProjectStatus = (typeof projectStatuses)[number];
export const exactArea = z
  .string()
  .regex(/^\d{1,24}(\.\d{1,24})?$/, "Use a non-negative exact decimal (up to 24 decimal places)");
export function compareDecimals(a: string, b: string) {
  const [ai, af = ""] = a.split("."),
    [bi, bf = ""] = b.split(".");
  const scale = Math.max(af.length, bf.length);
  const x = BigInt(ai + af.padEnd(scale, "0")),
    y = BigInt(bi + bf.padEnd(scale, "0"));
  return x < y ? -1 : x > y ? 1 : 0;
}
export function statusTransitionError(from: ProjectStatus, to: ProjectStatus, reason = "") {
  if (to === "closed") return "Closed is reserved for Task 10";
  if (from === "closed") return "Reopening closed projects is reserved for Task 10";
  if (projectStatuses.indexOf(to) < projectStatuses.indexOf(from) && !reason.trim())
    return "A written reason is required when moving backward";
  return null;
}
export const projectFields = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{2,20}$/, "Code must be 2–20 letters, digits or hyphens"),
    name: z.string().trim().min(1).max(120),
    type: z.enum(projectTypes),
    city: z.string().trim().min(1).max(120),
    area_name: z.string().trim().max(200).nullable().optional(),
    address: z.string().trim().max(1000).nullable().optional(),
    start_date: dateSchema.nullable().optional(),
    planned_end_date: dateSchema.nullable().optional(),
    land_area_sqft: exactArea.nullable().optional(),
    covered_area_sqft: exactArea.nullable().optional(),
    saleable_area_sqft: exactArea.nullable().optional(),
    project_manager_id: z.string().uuid().nullable().optional(),
    cost_allocation_method: z.enum(["saleable_area", "sale_value"]).default("saleable_area"),
    revenue_recognition: z.enum(["on_handover"]).default("on_handover"),
    notes: z.string().max(4000).nullable().optional(),
  })
  .strict();
export function profileIssues(p: {
  start_date?: string | null;
  planned_end_date?: string | null;
  covered_area_sqft?: string | null;
  saleable_area_sqft?: string | null;
}) {
  const issues: string[] = [];
  if (p.start_date && p.planned_end_date && p.planned_end_date < p.start_date)
    issues.push("Planned end date must not be before start date");
  if (
    p.covered_area_sqft != null &&
    p.saleable_area_sqft != null &&
    /^\d+(\.\d+)?$/.test(p.covered_area_sqft) &&
    /^\d+(\.\d+)?$/.test(p.saleable_area_sqft) &&
    compareDecimals(p.saleable_area_sqft, p.covered_area_sqft) > 0
  )
    issues.push(
      "Saleable area must not exceed covered area; for plots leave covered area unset if it is not applicable",
    );
  return issues;
}
export const projectCreateSchema = projectFields.superRefine((p, ctx) => {
  for (const message of profileIssues(p)) ctx.addIssue({ code: "custom", message });
});
export const projectPatchSchema = projectFields.partial().strict();
export const buildingSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    floors: z.number().int().min(0).max(10000),
    sort_order: z.number().int().min(0).default(0),
  })
  .strict();
export type ProjectInput = z.infer<typeof projectFields>;

import { BankAccountSchema } from "@/domain/bankAccount";
import { z } from "zod";
import { db, query } from "@/data/client";
import { newId, now } from "@/data/ids";
import { ProjectStatuses, type ProjectStatus } from "./projectsRepository";
import type { Project } from "@/domain/types";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date");
const amount = z.number().int().positive().safe();

export const LandAcquisitionSchema = z.object({
  account_key: BankAccountSchema.optional(),
  title: z.string().trim().min(1, "Enter a name for the land").max(120),
  location: z.string().trim().min(1, "Enter the land location").max(500),
  purchase_date: date,
  area_value: z.number().positive().finite().nullable(),
  area_unit: z.enum(["marla", "kanal", "sqft", "sqyd", "acre"]).nullable(),
  seller_name: z.string().trim().max(120),
  price: amount.nullable(),
  notes: z.string().trim().max(1000),
}).refine((value) => (value.area_value === null) === (value.area_unit === null), {
  path: ["area_value"], message: "Enter both the land area and its unit",
});

export type LandAcquisitionInput = z.infer<typeof LandAcquisitionSchema>;
export type ProjectLand = Omit<LandAcquisitionInput, "seller_name"> & { id: string; seller_name: string };

export async function getProjectLand(projectId: string): Promise<ProjectLand | null> {
  const rows = await query<ProjectLand & { custom: string }>(`SELECT id, account_key, title, location, purchase_date, area_value, area_unit, price,
    notes, custom FROM land WHERE project_id = ? AND archived = 0 ORDER BY created_at LIMIT 1`, [projectId]);
  const row = rows[0];
  if (!row) return null;
  let sellerName = "";
  try { sellerName = JSON.parse(row.custom)?.seller_name ?? ""; } catch { /* Older records may not have valid custom data. */ }
  return { ...row, seller_name: sellerName };
}

/** Save stage details and the new status in one SQLite transaction. */
export async function saveProjectStage(projectId: string, status: ProjectStatus,
  land?: LandAcquisitionInput): Promise<Project> {
  const validStatus = z.enum(ProjectStatuses).parse(status);
  if (validStatus === "land acquired" && !land) throw new Error("Land details are required");
  const validLand = land ? LandAcquisitionSchema.parse(land) : null;
  if (validLand && validStatus !== "land acquired") throw new Error("Land details require the Land acquired status");
  if (validLand?.price != null) BankAccountSchema.parse(validLand.account_key);
  const database = await db();
  const timestamp = now();
  await database.execute("BEGIN IMMEDIATE");
  try {
    const projects = await database.select<Project[]>("SELECT * FROM projects WHERE id = ? AND archived = 0", [projectId]);
    if (!projects[0]) throw new Error("Project not found");
    if (validLand) {
      const existing = await database.select<{ id: string }[]>("SELECT id FROM land WHERE project_id = ? AND archived = 0 ORDER BY created_at LIMIT 1", [projectId]);
      if (existing[0]) {
        await database.execute(`UPDATE land SET title = ?, location = ?, purchase_date = ?, area_value = ?, area_unit = ?,
          price = ?, notes = ?, custom = ?, status = 'acquired', updated_at = ?, account_key = ? WHERE id = ?`,
        [validLand.title, validLand.location, validLand.purchase_date, validLand.area_value, validLand.area_unit,
          validLand.price, validLand.notes || null, JSON.stringify({ seller_name: validLand.seller_name }), timestamp, validLand.account_key ?? null, existing[0].id]);
      } else {
        await database.execute(`INSERT INTO land (id, title, location, area_value, area_unit, purchase_date, price,
          status, project_id, is_personal, notes, created_at, updated_at, archived, custom, account_key)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'acquired', ?, 0, ?, ?, ?, 0, ?, ?)`,
        [newId(), validLand.title, validLand.location, validLand.area_value, validLand.area_unit, validLand.purchase_date,
          validLand.price, projectId, validLand.notes || null, timestamp, timestamp, JSON.stringify({ seller_name: validLand.seller_name }), validLand.account_key ?? null]);
      }
      // The acquired land defines the plot size for this project's building plan.
      await database.execute(`UPDATE project_building_details SET plot_area_value = ?, plot_area_unit = ?,
        updated_at = ? WHERE project_id = ? AND archived = 0`,
      [validLand.area_value, validLand.area_unit, timestamp, projectId]);
    }
    await database.execute("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?", [validStatus, timestamp, projectId]);
    await database.execute("COMMIT");
  } catch (cause) {
    await database.execute("ROLLBACK");
    throw cause;
  }
  const projects = await query<Project>("SELECT * FROM projects WHERE id = ?", [projectId]);
  if (!projects[0]) throw new Error("Stage was saved but the project could not be reloaded");
  return projects[0];
}

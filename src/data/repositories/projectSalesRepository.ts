import { z } from "zod";
import { execute, query } from "@/data/client";
import { newId, now } from "@/data/ids";

export const ProjectSaleSchema = z.object({
  project_id: z.string().uuid(),
  kind: z.enum(["flat", "shop"]),
  floor_index: z.number().int().min(0).max(100),
  unit_number: z.string().trim().min(1, "Enter the flat or shop number").max(80),
  rooms: z.number().int().min(1).max(20).nullable(),
  buyer_name: z.string().trim().min(1, "Enter the buyer's name").max(120),
  buyer_phone: z.string().trim().max(40),
  buyer_address: z.string().trim().max(500),
  sale_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a sale date"),
  price: z.number().int().positive("Enter a sale price").max(Number.MAX_SAFE_INTEGER),
  notes: z.string().trim().max(2000),
}).superRefine((value, ctx) => {
  if (value.kind === "shop" && value.rooms !== null)
    ctx.addIssue({ code: "custom", path: ["rooms"], message: "Shops do not have a room type" });
});

export type ProjectSaleInput = z.infer<typeof ProjectSaleSchema>;
export interface ProjectSale extends ProjectSaleInput {
  id: string;
  created_at: string;
  updated_at: string;
  archived: number;
  custom: string;
}

export async function listProjectSales(projectId: string): Promise<ProjectSale[]> {
  return query<ProjectSale>(
    `SELECT * FROM project_sales WHERE project_id = ? AND archived = 0 ORDER BY sale_date DESC, created_at DESC`,
    [projectId],
  );
}

export async function addProjectSale(input: ProjectSaleInput): Promise<ProjectSale> {
  const value = ProjectSaleSchema.parse(input);
  const id = newId();
  const timestamp = now();
  try {
    await execute(
      `INSERT INTO project_sales
       (id, project_id, kind, floor_index, unit_number, rooms, buyer_name, buyer_phone, buyer_address,
        sale_date, price, notes, created_at, updated_at, archived, custom)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '{}')`,
      [id, value.project_id, value.kind, value.floor_index, value.unit_number, value.rooms,
        value.buyer_name, value.buyer_phone || null, value.buyer_address || null,
        value.sale_date, value.price, value.notes || null, timestamp, timestamp],
    );
  } catch (cause) {
    if (/UNIQUE constraint failed/i.test(String(cause)))
      throw Object.assign(new Error("This unit is already recorded as sold on the selected floor."), { cause });
    throw cause;
  }
  const rows = await query<ProjectSale>(`SELECT * FROM project_sales WHERE id = ?`, [id]);
  if (!rows[0]) throw new Error("Sale was saved but could not be loaded");
  return rows[0];
}

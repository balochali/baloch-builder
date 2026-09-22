import { z } from "zod";
import { execute, query } from "@/data/client";
import { newId, now } from "@/data/ids";
import type { Project } from "@/domain/types";

export const CreateProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(120),
  location: z.string().trim().min(1, "Project address is required").max(500),
  code: z.string().trim().max(40),
  description: z.string().trim().max(2000),
  status: z.enum(["planning", "land acquired", "under construction", "completed", "on hold"]),
  start_date: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/, "Enter a valid start date"),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export async function listProjects(): Promise<Project[]> {
  return query<Project>(
    `SELECT * FROM projects WHERE archived = 0 ORDER BY created_at DESC, name ASC`,
  );
}

export async function getProjectById(id: string): Promise<Project | null> {
  const rows = await query<Project>(
    `SELECT * FROM projects WHERE id = ? AND archived = 0`, [id],
  );
  return rows[0] ?? null;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const data = CreateProjectSchema.parse(input);
  const id = newId();
  const timestamp = now();

  await execute(
    `INSERT INTO projects
      (id, code, name, location, description, status, start_date, created_at, updated_at, archived, custom)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '{}')`,
    [
      id,
      data.code || null,
      data.name,
      data.location,
      data.description || null,
      data.status,
      data.start_date || null,
      timestamp,
      timestamp,
    ],
  );

  const rows = await query<Project>(`SELECT * FROM projects WHERE id = ?`, [id]);
  if (!rows[0]) throw new Error("Project was saved but could not be loaded");
  return rows[0];
}

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  projectCreateSchema,
  projectPatchSchema,
  projectFields,
  profileIssues,
  projectStatuses,
  statusTransitionError,
  buildingSchema,
  type ProjectInput,
  type ProjectStatus,
} from "@baloch/shared";
import { pool, transaction, audit } from "./db";
export const failure = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
const id = (r: FastifyRequest) => z.object({ id: z.string().uuid() }).parse(r.params).id;
export async function deny(r: FastifyRequest, message = "Permission denied"): Promise<never> {
  await audit(r.actor!.id, "permission_denied", r.routeOptions.url ?? r.url);
  throw failure(message, 403);
}
export type ProjectRow = ProjectInput & {
  id: string;
  status: ProjectStatus;
  archived: boolean;
  archived_at: string | null;
  assigned_user_count: number;
  project_manager_name: string | null;
};
const selectProject = `SELECT p.*,to_char(p.start_date,'YYYY-MM-DD') AS start_date,to_char(p.planned_end_date,'YYYY-MM-DD') AS planned_end_date,u.email AS project_manager_name,
 (SELECT count(*)::int FROM project_assignments a JOIN users au ON au.id=a.user_id WHERE a.project_id=p.id AND a.active AND au.active) AS assigned_user_count
 FROM projects p LEFT JOIN users u ON u.id=p.project_manager_id`;
export async function requireProject(r: FastifyRequest, projectId: string) {
  const p = (await pool.query<ProjectRow>(selectProject + " WHERE p.id=$1", [projectId])).rows[0];
  if (!p) throw failure("Project not found", 404);
  if (
    ["sales", "construction"].includes(r.actor!.role) &&
    !(
      await pool.query(
        "SELECT 1 FROM project_assignments WHERE project_id=$1 AND user_id=$2 AND active",
        [projectId, r.actor!.id],
      )
    ).rowCount
  )
    await deny(r, "You are not assigned to this project");
  return p;
}
export function registerProjectRoutes(app: FastifyInstance) {
  app.get("/api/projects", { config: { permission: "projects" } }, async (r) => {
    const q = z.object({ includeArchived: z.enum(["true", "false"]).optional() }).parse(r.query);
    return (
      await pool.query(
        selectProject +
          ` WHERE ($3::boolean OR NOT p.archived) AND ($1 IN ('admin','accountant') OR EXISTS(SELECT 1 FROM project_assignments a WHERE a.project_id=p.id AND a.user_id=$2 AND a.active)) ORDER BY p.code`,
        [r.actor!.role, r.actor!.id, q.includeArchived === "true"],
      )
    ).rows;
  });
  app.get("/api/projects/:id", { config: { permission: "projects" } }, (r) =>
    requireProject(r, id(r)),
  );
  app.post("/api/projects", { config: { permission: "manageProjects" } }, async (r) => {
    const d = projectCreateSchema.parse(r.body);
    const entries = Object.entries(d);
    const created = await transaction(
      r.actor!.id,
      async (c) =>
        (
          await c.query(
            `INSERT INTO projects(${entries.map(([k]) => k).join(",")},created_by) VALUES(${entries.map((_, i) => "$" + (i + 1)).join(",")},$${entries.length + 1}) RETURNING id`,
            [...entries.map(([, v]) => v), r.actor!.id],
          )
        ).rows[0],
    );
    return requireProject(r, created.id);
  });
  app.patch("/api/projects/:id", { config: { permission: "projects" } }, async (r) => {
    await requireProject(r, id(r));
    if (!["admin", "accountant"].includes(r.actor!.role))
      await deny(r, "Project profile is read-only for your role");
    const d = projectPatchSchema.parse(r.body);
    if (
      r.actor!.role === "accountant" &&
      Object.keys(d).some((k) => !["cost_allocation_method", "revenue_recognition"].includes(k))
    )
      await deny(r, "Accountant may edit allocation and revenue settings only");
    await transaction(r.actor!.id, async (c) => {
      await c.query("SELECT accounting_lock()");
      const existing = (
        await c.query<ProjectRow>(selectProject + " WHERE p.id=$1 FOR UPDATE OF p", [id(r)])
      ).rows[0];
      const merged = { ...existing, ...d };
      const messages = profileIssues(merged);
      if (messages.length) throw failure(messages.join("; "));
      const entries = Object.entries(d).filter(([k]) => k in projectFields.shape);
      if (entries.length)
        await c.query(
          `UPDATE projects SET ${entries.map(([k], i) => `${k}=$${i + 1}`).join(",")} WHERE id=$${entries.length + 1}`,
          [...entries.map(([, v]) => v), id(r)],
        );
    });
    return requireProject(r, id(r));
  });
  app.post("/api/projects/:id/status", { config: { permission: "manageProjects" } }, async (r) => {
    const d = z
      .object({ status: z.enum(projectStatuses), reason: z.string().trim().max(4000).default("") })
      .strict()
      .parse(r.body);
    await transaction(r.actor!.id, async (c) => {
      await c.query("SELECT accounting_lock()");
      const p = (
        await c.query<ProjectRow>("SELECT * FROM projects WHERE id=$1 FOR UPDATE", [id(r)])
      ).rows[0];
      if (!p) throw failure("Project not found", 404);
      const message = statusTransitionError(p.status, d.status, d.reason);
      if (message) throw failure(message);
      await c.query("SELECT set_config('app.status_reason',$1,true)", [d.reason]);
      await c.query("UPDATE projects SET status=$1 WHERE id=$2", [d.status, id(r)]);
    });
    return requireProject(r, id(r));
  });
  app.post("/api/projects/:id/archive", { config: { permission: "manageProjects" } }, async (r) => {
    const d = z.object({ archived: z.boolean() }).strict().parse(r.body);
    await requireProject(r, id(r));
    await transaction(r.actor!.id, (c) =>
      c.query(
        "UPDATE projects SET archived=$1,archived_at=CASE WHEN $1 THEN coalesce(archived_at,now()) ELSE NULL END WHERE id=$2",
        [d.archived, id(r)],
      ),
    );
    return requireProject(r, id(r));
  });
  app.get("/api/projects/:id/status-history", { config: { permission: "projects" } }, async (r) => {
    await requireProject(r, id(r));
    return (
      await pool.query(
        "SELECT h.*,u.email AS changed_by_name FROM project_status_history h JOIN users u ON u.id=h.changed_by WHERE project_id=$1 ORDER BY changed_at,id",
        [id(r)],
      )
    ).rows;
  });
  app.get("/api/projects/:id/buildings", { config: { permission: "projects" } }, async (r) => {
    await requireProject(r, id(r));
    return (
      await pool.query(
        "SELECT * FROM project_buildings WHERE project_id=$1 ORDER BY sort_order,name",
        [id(r)],
      )
    ).rows;
  });
  app.post(
    "/api/projects/:id/buildings",
    { config: { permission: "manageProjects" } },
    async (r) => {
      await requireProject(r, id(r));
      const d = buildingSchema.parse(r.body);
      return transaction(
        r.actor!.id,
        async (c) =>
          (
            await c.query(
              "INSERT INTO project_buildings(project_id,name,floors,sort_order,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *",
              [id(r), d.name, d.floors, d.sort_order, r.actor!.id],
            )
          ).rows[0],
      );
    },
  );
  app.patch(
    "/api/projects/:id/buildings/:buildingId",
    { config: { permission: "manageProjects" } },
    async (r) => {
      await requireProject(r, id(r));
      const d = buildingSchema.parse(r.body);
      const b = z.object({ buildingId: z.string().uuid() }).parse(r.params);
      return transaction(r.actor!.id, async (c) => {
        const result = await c.query(
          "UPDATE project_buildings SET name=$1,floors=$2,sort_order=$3 WHERE id=$4 AND project_id=$5 RETURNING *",
          [d.name, d.floors, d.sort_order, b.buildingId, id(r)],
        );
        if (!result.rowCount) throw failure("Building not found", 404);
        return result.rows[0];
      });
    },
  );
  app.delete(
    "/api/projects/:id/buildings/:buildingId",
    { config: { permission: "manageProjects" } },
    async (r) => {
      await requireProject(r, id(r));
      const b = z.object({ buildingId: z.string().uuid() }).parse(r.params);
      await transaction(r.actor!.id, async (c) => {
        if (
          !(
            await c.query("DELETE FROM project_buildings WHERE id=$1 AND project_id=$2", [
              b.buildingId,
              id(r),
            ])
          ).rowCount
        )
          throw failure("Building not found", 404);
      });
      return { ok: true };
    },
  );
}

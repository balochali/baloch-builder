import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool, transaction } from "./db";
import { requireProject, failure } from "./projects";
export function registerAssignmentRoutes(app: FastifyInstance) {
  const select = `SELECT a.*,u.email,u.role,u.active AS user_active,p.code AS project_code FROM project_assignments a JOIN users u ON u.id=a.user_id JOIN projects p ON p.id=a.project_id`;
  app.get(
    "/api/assignments",
    { config: { permission: "users" } },
    async () => (await pool.query(select + " ORDER BY p.code,u.email")).rows,
  );
  app.get("/api/projects/:id/assignments", { config: { permission: "projects" } }, async (r) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(r.params);
    await requireProject(r, id);
    return (await pool.query(select + " WHERE a.project_id=$1 AND a.active ORDER BY u.email", [id]))
      .rows;
  });
  app.post("/api/assignments", { config: { permission: "users" } }, async (r) => {
    const d = z
      .object({
        projectId: z.string().uuid(),
        userId: z.string().uuid(),
        active: z.boolean().default(true),
      })
      .strict()
      .parse(r.body);
    await requireProject(r, d.projectId);
    return transaction(r.actor!.id, async (c) => {
      if (!(await c.query("SELECT 1 FROM users WHERE id=$1", [d.userId])).rowCount)
        throw failure("User not found", 404);
      return (
        await c.query(
          "INSERT INTO project_assignments(project_id,user_id,active,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(project_id,user_id) DO UPDATE SET active=excluded.active,updated_at=now() RETURNING *",
          [d.projectId, d.userId, d.active, r.actor!.id],
        )
      ).rows[0];
    });
  });
}

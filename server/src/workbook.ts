import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { workbookSheets, workbookSchemas } from "@baloch/shared";
import { pool, transaction } from "./db";
import { requireProject, failure } from "./projects";
const params = z.object({
  id: z.string().uuid(),
  sheet: z.enum(workbookSheets),
  rowId: z.string().uuid().optional(),
});
const present = (row: { id: string; version: number; data: Record<string, unknown> }) => ({
  ...row.data,
  id: row.id,
  version: row.version,
});
export function registerWorkbookRoutes(app: FastifyInstance) {
  app.get(
    "/api/projects/:id/workbook/:sheet",
    { config: { permission: "projects" } },
    async (r) => {
      const p = params.parse(r.params);
      await requireProject(r, p.id);
      return (
        await pool.query(
          "SELECT id,version,data FROM project_workbook_rows WHERE project_id=$1 AND sheet=$2 AND NOT removed ORDER BY created_at,id",
          [p.id, p.sheet],
        )
      ).rows.map(present);
    },
  );
  app.post(
    "/api/projects/:id/workbook/:sheet",
    { config: { permission: "manageProjects" } },
    async (r) => {
      const p = params.parse(r.params);
      await requireProject(r, p.id);
      const data = workbookSchemas[p.sheet].parse(r.body);
      return transaction(r.actor!.id, async (c) => {
        await c.query("SELECT accounting_lock()");
        return present(
          (
            await c.query(
              "INSERT INTO project_workbook_rows(project_id,sheet,data,created_by) VALUES($1,$2,$3,$4) RETURNING id,version,data",
              [p.id, p.sheet, JSON.stringify(data), r.actor!.id],
            )
          ).rows[0],
        );
      });
    },
  );
  // Cost and sales estimates keep removed rows for the audit trail; other registers cannot be removed.
  for (const removable of ["estimate", "sales_estimate"] as const)
    app.delete(
      `/api/projects/:id/workbook/${removable}/:rowId`,
      { config: { permission: "manageProjects" } },
      async (r) => {
        const p = params.parse({ ...(r.params as object), sheet: removable });
        await requireProject(r, p.id);
        const body = z.object({ version: z.number().int().positive() }).strict().parse(r.body);
        return transaction(r.actor!.id, async (c) => {
          await c.query("SELECT accounting_lock()");
          const result = await c.query(
            "UPDATE project_workbook_rows SET removed=true WHERE id=$1 AND project_id=$2 AND sheet=$3 AND version=$4 AND NOT removed RETURNING id",
            [p.rowId, p.id, removable, body.version],
          );
          if (!result.rowCount)
            throw failure(
              "This row changed or was already removed. Reopen the sheet before deleting it.",
              409,
            );
          return { id: p.rowId, removed: true };
        });
      },
    );
  app.patch(
    "/api/projects/:id/workbook/:sheet/:rowId",
    { config: { permission: "manageProjects" } },
    async (r) => {
      const p = params.parse(r.params);
      await requireProject(r, p.id);
      const body = z
        .object({ version: z.number().int().positive(), data: z.unknown() })
        .strict()
        .parse(r.body);
      const data = workbookSchemas[p.sheet].parse(body.data);
      return transaction(r.actor!.id, async (c) => {
        await c.query("SELECT accounting_lock()");
        const result = await c.query(
          "UPDATE project_workbook_rows SET data=$1 WHERE id=$2 AND project_id=$3 AND sheet=$4 AND version=$5 AND NOT removed RETURNING id,version,data",
          [JSON.stringify(data), p.rowId, p.id, p.sheet, body.version],
        );
        if (!result.rowCount)
          throw failure(
            "This row changed or is no longer available. Reload the sheet before editing again.",
            409,
          );
        return present(result.rows[0]);
      });
    },
  );
}

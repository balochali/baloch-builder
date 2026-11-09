import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { can } from "@baloch/shared";
import { pool, transaction } from "./db";
import { accountingError as fail } from "./journal";
import { readLand, postLand, voidLand, lockLandProject, checkLandFunds } from "./land";
export function registerLand(app: FastifyInstance) {
  const params = z.object({
    id: z.string().regex(/^P-\d+$/),
    recordId: z.string().uuid().optional(),
  });
  const projectId = async (code: string) => {
    const r = (await pool.query("SELECT id FROM projects WHERE code=$1", [code])).rows[0];
    if (!r) throw fail("Project not found.", 404);
    return r.id as string;
  };
  app.get("/api/projects/:id/land", { config: { permission: "projects" } }, async (request) => {
    if (!can(request.actor!.role, "ledger"))
      throw fail("Ledger access is required to view land finances.", 403);
    // Serialize the view with land writes to keep sources and totals consistent.
    return transaction(request.actor!.id, async (c) => {
      await lockLandProject(c, await projectId(params.parse(request.params).id));
      return readLand(c, await projectId(params.parse(request.params).id));
    });
  });
  for (const [path, kind] of [
    ["purchase", "purchase"],
    ["payments", "payment"],
    ["costs", "cost"],
    ["contribution", "contribution"],
  ] as const) {
    app.post(
      `/api/projects/:id/land/${path}`,
      { config: { permission: "manageProjects" } },
      async (request) => {
        const p = params.parse(request.params);
        return transaction(request.actor!.id, async (c) =>
          postLand(c, await projectId(p.id), kind, request.body),
        );
      },
    );
    app.put(
      `/api/projects/:id/land/${path}/:recordId`,
      { config: { permission: "manageProjects" } },
      async (request) => {
        const p = params.parse(request.params);
        return transaction(request.actor!.id, async (c) =>
          postLand(c, await projectId(p.id), kind, request.body, p.recordId),
        );
      },
    );
    app.post(
      `/api/projects/:id/land/${path}/:recordId/void`,
      { config: { permission: "manageProjects" } },
      async (request) => {
        const p = params.parse(request.params);
        const body = z
          .object({
            reason: z.string().trim().min(1).max(250),
            expectedVoucherId: z.string().optional(),
          })
          .parse(request.body);
        return transaction(request.actor!.id, async (c) => {
          await voidLand(
            c,
            await projectId(p.id),
            kind,
            p.recordId!,
            body.reason,
            body.expectedVoucherId,
          );
          await checkLandFunds(c, await projectId(p.id));
          return { ok: true };
        });
      },
    );
  }
}

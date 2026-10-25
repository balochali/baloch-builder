import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { costHeadSchema, costHeadPatchSchema } from "@baloch/shared";
import { pool, transaction } from "./db";
import { failure } from "./projects";
export function registerCostHeadRoutes(app: FastifyInstance) {
  app.get(
    "/api/cost-heads",
    { config: { permission: "readCostHeads" } },
    async (r) =>
      (
        await pool.query(
          `SELECT h.*, a.code AS default_account_code, p.code AS parent_code,
 (SELECT count(*)::int FROM voucher_lines l WHERE to_jsonb(l)->>'cost_head_id'=h.id::text) AS in_use_count
 FROM cost_heads h LEFT JOIN accounts a ON a.id=h.default_account_id LEFT JOIN cost_heads p ON p.id=h.parent_id WHERE ($1<>'construction' OR h.active) ORDER BY h.sort_order,h.code`,
          [r.actor!.role],
        )
      ).rows,
  );
  app.post("/api/cost-heads", { config: { permission: "costHeads" } }, async (r) => {
    const d = costHeadSchema.parse(r.body);
    return transaction(
      r.actor!.id,
      async (c) =>
        (
          await c.query(
            "INSERT INTO cost_heads(code,name,parent_id,default_account_id,budget_only,active,sort_order,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
            [
              d.code,
              d.name,
              d.parent_id,
              d.default_account_id,
              d.budget_only,
              d.active,
              d.sort_order,
              r.actor!.id,
            ],
          )
        ).rows[0],
    );
  });
  app.patch("/api/cost-heads/:id", { config: { permission: "costHeads" } }, async (r) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(r.params);
    const d = costHeadPatchSchema.parse(r.body);
    const entries = Object.entries(d);
    if (!entries.length) throw failure("No changes supplied");
    return transaction(r.actor!.id, async (c) => {
      const out = await c.query(
        `UPDATE cost_heads SET ${entries.map(([k], i) => `${k}=$${i + 1}`).join(",")} WHERE id=$${entries.length + 1} RETURNING *`,
        [...entries.map(([, v]) => v), id],
      );
      if (!out.rowCount) throw failure("Cost head not found", 404);
      return out.rows[0];
    });
  });
}

import { registerProjectSite } from "./projectSite";
import { feasibilitySchema } from "@baloch/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  basicsSchema,
  budgetSchema,
  emptyBasics,
  emptyBudget,
  projectName,
  purchaseSchema,
} from "@baloch/shared";
import { pool, transaction } from "./db";

const read = { config: { permission: "projects" as const } };
const write = { config: { permission: "manageProjects" as const } };
const columns =
  "code AS id, name, (details - ARRAY['feasibility','landParcels','building','sitePartners']) AS details, draft, created_at AS \"createdAt\", updated_at AS \"updatedAt\"";
function serialize(row: Record<string, unknown>) {
  const { details, ...identity } = row;
  return { ...emptyBasics, ...emptyBudget, ...(details as object), ...identity };
}
function missing() {
  return Object.assign(new Error("Project or file not found."), { statusCode: 404 });
}
function code(request: FastifyRequest) {
  return z.object({ id: z.string().regex(/^P-\d+$/) }).parse(request.params).id;
}
const fileSchema = z.object({
  name: z.string().trim().min(1).max(255),
  content: z.string().base64().min(4).max(7_000_000),
});
const updateSchema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("name"), name: projectName }),
  z.object({ step: z.literal("basics"), basics: basicsSchema }),
  z.object({ step: z.literal("finish"), budget: budgetSchema }),
  z.object({
    step: z.literal("edit"),
    name: projectName,
    basics: basicsSchema,
    budget: budgetSchema,
  }),
]);
async function withNameConflict<T>(save: () => Promise<T>) {
  try {
    return await save();
  } catch (error) {
    if ((error as { constraint?: string }).constraint === "project_name_unique")
      throw Object.assign(new Error("A project with this name already exists."), {
        statusCode: 409,
      });
    throw error;
  }
}

export function registerProjectRoutes(app: FastifyInstance) {
  registerProjectSite(app);
  app.get("/api/projects", read, async () =>
    (await pool.query(`SELECT ${columns} FROM projects ORDER BY created_at DESC,id DESC`)).rows.map(
      serialize,
    ),
  );
  app.get(
    "/api/projects/partner-options",
    write,
    async () =>
      (await pool.query("SELECT id,name FROM partners WHERE status='Active' ORDER BY name")).rows,
  );
  app.post(
    "/api/projects/reserve-id",
    write,
    async (request) =>
      (
        await pool.query(
          "INSERT INTO project_code_reservations(owner_id) VALUES($1) RETURNING code AS id",
          [request.actor!.id],
        )
      ).rows[0],
  );
  app.post("/api/projects", write, async (request) => {
    const { name, id } = z
      .object({
        name: projectName,
        id: z
          .string()
          .regex(/^P-\d+$/)
          .optional(),
      })
      .strict()
      .parse(request.body);
    return withNameConflict(() =>
      transaction(request.actor!.id, async (c) => {
        if (id) {
          const reservation = await c.query(
            "UPDATE project_code_reservations SET used=true WHERE code=$1 AND owner_id=$2 AND NOT used",
            [id, request.actor!.id],
          );
          if (!reservation.rowCount)
            throw Object.assign(
              new Error("This project ID is no longer reserved. Reopen the form to try again."),
              { statusCode: 409 },
            );
        }
        const { rows } = await c.query(
          id
            ? `INSERT INTO projects(name,created_by,code) VALUES($1,$2,$3) RETURNING ${columns}`
            : `INSERT INTO projects(name,created_by) VALUES($1,$2) RETURNING ${columns}`,
          id ? [name, request.actor!.id, id] : [name, request.actor!.id],
        );
        return serialize(rows[0]);
      }),
    );
  });
  app.get("/api/projects/:id", read, async (request) => {
    const row = (await pool.query(`SELECT ${columns} FROM projects WHERE code=$1`, [code(request)]))
      .rows[0];
    if (!row) throw missing();
    return serialize(row);
  });
  app.get("/api/projects/:id/feasibility", read, async (request) => {
    const row = (
      await pool.query("SELECT details->'feasibility' AS plan FROM projects WHERE code=$1", [
        code(request),
      ])
    ).rows[0];
    if (!row) throw missing();
    return row.plan ? feasibilitySchema.parse(row.plan) : null;
  });
  app.put("/api/projects/:id/feasibility", write, async (request) => {
    const input = z
      .object({
        plan: feasibilitySchema,
        action: z.enum(["save", "approve", "unlock"]),
        revision: z.string().datetime().nullable(),
      })
      .parse(request.body);
    return transaction(request.actor!.id, async (c) => {
      const row = (
        await c.query(
          "SELECT details->'feasibility' AS plan FROM projects WHERE code=$1 FOR UPDATE",
          [code(request)],
        )
      ).rows[0];
      if (!row) throw missing();
      if (
        (row.plan?.updatedAt ?? null) !== input.revision ||
        (row.plan?.status === "approved") !== (input.action === "unlock")
      )
        throw Object.assign(
          new Error("The plan changed or is locked. Reopen Feasibility before editing."),
          { statusCode: 409 },
        );
      const now = new Date(
        Math.max(Date.now(), Date.parse(input.revision ?? "") + 1 || 0),
      ).toISOString();
      const plan = {
        ...(input.action === "unlock" ? feasibilitySchema.parse(row.plan) : input.plan),
        status: input.action === "approve" ? "approved" : "draft",
        approvedAt: input.action === "approve" ? now : null,
        updatedAt: now,
      };
      if (input.action !== "unlock") {
        for (const partner of plan.partners) {
          if (!partner.name.trim() && !partner.partnerId) continue;
          const byId = (
            await c.query("SELECT id,name FROM partners WHERE id::text=$1", [
              partner.partnerId ?? "",
            ])
          ).rows[0];
          if (!byId)
            throw Object.assign(new Error("Select a valid master partner."), { statusCode: 400 });
          partner.name = byId.name;
        }
      }
      await c.query(
        "UPDATE projects SET details=jsonb_set(details,'{feasibility}',$2::jsonb), updated_at=now() WHERE code=$1",
        [code(request), JSON.stringify(plan)],
      );
      return plan;
    });
  });
  app.patch("/api/projects/:id", write, async (request) => {
    const update = updateSchema.parse(request.body);
    const name = "name" in update ? update.name : null;
    const details = {
      ...("basics" in update ? update.basics : {}),
      ...("budget" in update ? update.budget : {}),
    };
    return withNameConflict(() =>
      transaction(request.actor!.id, async (c) => {
        if ("budget" in update) {
          for (const partner of update.budget.partners) {
            const master = (
              await c.query("SELECT name FROM partners WHERE id=$1", [partner.partnerId])
            ).rows[0];
            if (!master)
              throw Object.assign(new Error("Select a valid master partner."), { statusCode: 400 });
            partner.name = master.name;
          }
        }
        const row = (
          await c.query(
            `UPDATE projects SET name=COALESCE($2,name), details=details || $3::jsonb,
        draft=CASE WHEN $4 THEN false ELSE draft END, updated_at=now() WHERE code=$1 RETURNING ${columns}`,
            [
              code(request),
              name,
              JSON.stringify(details),
              update.step === "finish" || update.step === "edit",
            ],
          )
        ).rows[0];
        if (!row) throw missing();
        return serialize(row);
      }),
    );
  });
  app.get("/api/projects/:id/records", read, async (request) => {
    const id = code(request);
    const [purchases, files] = await Promise.all([
      pool.query(
        "SELECT p.details || jsonb_build_object('id',p.id) AS purchase FROM project_purchases p JOIN projects j ON j.id=p.project_id WHERE j.code=$1 ORDER BY p.details->>'date' DESC,p.id",
        [id],
      ),
      pool.query(
        'SELECT f.id,f.name,f.purchase_id AS "purchaseId" FROM project_files f JOIN projects j ON j.id=f.project_id WHERE j.code=$1 ORDER BY f.name,f.id',
        [id],
      ),
    ]);
    return { purchases: purchases.rows.map((row) => row.purchase), files: files.rows };
  });
  app.post("/api/projects/:id/land", write, async (request) => {
    const { purchase, files } = z
      .object({ purchase: purchaseSchema, files: z.array(fileSchema).max(5) })
      .parse(request.body);
    return transaction(request.actor!.id, async (c) => {
      const row = (
        await c.query(
          "INSERT INTO project_purchases(project_id,details) SELECT id,$2 FROM projects WHERE code=$1 RETURNING id,project_id",
          [code(request), JSON.stringify(purchase)],
        )
      ).rows[0];
      if (!row) throw missing();
      for (const file of files)
        await c.query(
          "INSERT INTO project_files(project_id,purchase_id,name,content) VALUES($1,$2,$3,$4)",
          [row.project_id, row.id, file.name, file.content],
        );
      return { id: row.id, ...purchase };
    });
  });
  app.post("/api/projects/:id/files", write, async (request) => {
    const file = fileSchema.parse(request.body);
    const row = (
      await pool.query(
        'INSERT INTO project_files(project_id,name,content) SELECT id,$2,$3 FROM projects WHERE code=$1 RETURNING id,name,purchase_id AS "purchaseId"',
        [code(request), file.name, file.content],
      )
    ).rows[0];
    if (!row) throw missing();
    return row;
  });
  app.get("/api/projects/:id/files/:fileId", read, async (request) => {
    const { fileId } = z.object({ fileId: z.string().uuid() }).parse(request.params);
    const row = (
      await pool.query(
        "SELECT f.name,f.content FROM project_files f JOIN projects j ON j.id=f.project_id WHERE j.code=$1 AND f.id=$2",
        [code(request), fileId],
      )
    ).rows[0];
    if (!row) throw missing();
    return row;
  });
}

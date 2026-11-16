import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { can, salesDate, partySchema } from "@baloch/shared";
import { pool, transaction, audit } from "./db";
import { accountingError as fail } from "./journal";
import {
  lockSales,
  readSales,
  saveSaleUnit,
  generateSaleUnits,
  saveSaleAgreement,
  saveSalePayment,
  voidSalePayment,
  handoverSale,
  cancelSale,
} from "./sales";
export function registerSales(app: FastifyInstance) {
  const read = { config: { permission: "ledger" as const } },
    write = { config: { permission: "manageProjects" as const } };
  const params = z.object({
    id: z.string().regex(/^P-\d+$/),
    recordId: z.string().uuid().optional(),
  });
  const pid = async (code: string) => {
    const p = (await pool.query("SELECT id FROM projects WHERE code=$1", [code])).rows[0];
    if (!p) throw fail("Project not found.", 404);
    return p.id as string;
  };
  const base = "/api/projects/:id/sales";
  app.get(base, read, async (r) =>
    transaction(r.actor!.id, async (c) => {
      const id = await pid(params.parse(r.params).id);
      await lockSales(c, id);
      return readSales(c, id);
    }),
  );
  app.post(base + "/generate-units", write, async (r) =>
    transaction(r.actor!.id, async (c) =>
      generateSaleUnits(c, await pid(params.parse(r.params).id), r.body),
    ),
  );
  for (const [part, save] of [
    ["units", saveSaleUnit],
    ["agreements", saveSaleAgreement],
    ["payments", saveSalePayment],
  ] as const) {
    app.post(base + "/" + part, write, async (r) =>
      transaction(r.actor!.id, async (c) => save(c, await pid(params.parse(r.params).id), r.body)),
    );
    app.put(base + "/" + part + "/:recordId", write, async (r) => {
      const p = params.parse(r.params);
      return transaction(r.actor!.id, async (c) => save(c, await pid(p.id), r.body, p.recordId));
    });
  }
  app.post(base + "/units/:recordId/deactivate", write, async (r) => {
    const p = params.parse(r.params);
    const d = z.object({ version: z.number().int().positive() }).parse(r.body);
    return transaction(r.actor!.id, async (c) => {
      const id = await pid(p.id);
      await lockSales(c, id);
      const u = (await readSales(c, id)).units.find((u) => u.id === p.recordId);
      if (!u) throw fail("Unit not found.", 404);
      return saveSaleUnit(c, id, { ...u, is_active: false, version: d.version }, u.id);
    });
  });
  app.post(base + "/units/bulk-price", write, async (r) => {
    const p = params.parse(r.params);
    const d = z
      .object({
        rows: z
          .array(
            z.object({
              id: z.string().uuid(),
              version: z.number().int().positive(),
              price: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
            }),
          )
          .min(1)
          .max(5000),
        perSqft: z.boolean().default(false),
      })
      .parse(r.body);
    return transaction(r.actor!.id, async (c) => {
      const id = await pid(p.id);
      await lockSales(c, id);
      const sheet = await readSales(c, id);
      for (const row of d.rows) {
        const u = sheet.units.find((u) => u.id === row.id);
        if (!u) throw fail("Unit not found.", 404);
        await saveSaleUnit(
          c,
          id,
          {
            ...u,
            list_price: d.perSqft ? Math.round(row.price * u.size_sqft) : row.price,
            version: row.version,
          },
          row.id,
        );
      }
      return { ok: true };
    });
  });
  app.post(base + "/payments/:recordId/void", write, async (r) => {
    const p = params.parse(r.params);
    const d = z
      .object({ reason: z.string().trim().min(1), expectedVoucherId: z.string().min(1) })
      .parse(r.body);
    return transaction(r.actor!.id, async (c) => {
      await voidSalePayment(c, await pid(p.id), p.recordId!, d.reason, d.expectedVoucherId);
      return { ok: true };
    });
  });
  for (const undo of [false, true])
    app.post(base + "/agreements/:recordId/handover" + (undo ? "/void" : ""), write, async (r) => {
      const p = params.parse(r.params);
      const d = z
        .object({
          date: salesDate,
          version: z.number().int().positive(),
          confirmZero: z.boolean().default(false),
        })
        .parse(r.body);
      return transaction(r.actor!.id, async (c) =>
        handoverSale(c, await pid(p.id), p.recordId!, d.date, d.version, d.confirmZero, undo),
      );
    });
  app.post(base + "/agreements/:recordId/cancel", write, async (r) => {
    const p = params.parse(r.params);
    return transaction(r.actor!.id, async (c) =>
      cancelSale(c, await pid(p.id), p.recordId!, r.body),
    );
  });
  app.get(base + "/payments/:recordId/receipt", read, async (r) => {
    const p = params.parse(r.params);
    return transaction(r.actor!.id, async (c) => {
      const id = await pid(p.id);
      await lockSales(c, id);
      const s = await readSales(c, id);
      const payment = s.payments.find((x) => x.id === p.recordId);
      if (!payment) throw fail("Payment not found.", 404);
      const agreement = s.agreements.find((x) => x.id === payment.agreement_id)!;
      return {
        company: "Baloch Builders & Developers",
        payment,
        agreement,
        unit: s.units.find((u) => u.id === agreement.unit_id),
        remaining: agreement.total_price - agreement.received,
      };
    });
  });
  app.get(
    "/api/parties",
    read,
    async () => (await pool.query("SELECT * FROM parties ORDER BY name")).rows,
  );
  app.post("/api/parties", write, async (r) => {
    const d = partySchema
      .extend({
        cnic: z.string().trim().max(40).default(""),
        second_contact: z.string().trim().max(120).default(""),
      })
      .parse(r.body);
    return transaction(r.actor!.id, async (c) => {
      const row = (
        await c.query(
          "INSERT INTO parties(name,type,phone,address,notes,cnic,second_contact) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
          [d.name, d.type, d.phone, d.address, d.notes, d.cnic, d.second_contact],
        )
      ).rows[0];
      await audit(r.actor!.id, "party.created", "parties", row.id, null, c);
      return row;
    });
  });
  app.get("/api/search", { config: { permission: "projects" } }, async (r) => {
    const { q } = z.object({ q: z.string().trim().max(100).default("") }).parse(r.query);
    if (q.length < 2) return [];
    const pattern = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
    const projects = (
      await pool.query(
        "SELECT code AS id,name AS label,'project' AS kind,'/projects/'||code AS url FROM projects WHERE name ILIKE $1 OR code ILIKE $1 ORDER BY name LIMIT 12",
        [pattern],
      )
    ).rows;
    if (!can(r.actor!.role, "ledger")) return projects;
    const units = (
      await pool.query(
        "SELECT u.id,u.unit_no||' · '||p.name AS label,'unit' AS kind,'/projects/'||p.code||'/sales?unit='||u.id AS url FROM sale_units u JOIN projects p ON p.id=u.project_id WHERE u.unit_no ILIKE $1 LIMIT 12",
        [pattern],
      )
    ).rows;
    const customers = (
      await pool.query(
        "SELECT c.id,c.name AS label,'customer' AS kind,coalesce((SELECT '/projects/'||p.code||'/sales?unit='||a.unit_id FROM sale_agreements a JOIN projects p ON p.id=a.project_id WHERE a.customer_party_id=c.id ORDER BY a.created_at DESC LIMIT 1),'/projects') AS url FROM parties c WHERE c.type='client' AND (c.name ILIKE $1 OR c.phone ILIKE $1) LIMIT 12",
        [pattern],
      )
    ).rows;
    const partners = (
      await pool.query(
        "SELECT id,name AS label,'partner' AS kind,'/partners' AS url FROM partners WHERE name ILIKE $1 LIMIT 12",
        [pattern],
      )
    ).rows;
    const vouchers = (
      await pool.query(
        "SELECT v.id,v.id||' · '||v.narration AS label,'entry' AS kind,'/projects/'||p.code||'/transactions?voucher='||v.id AS url FROM journal_vouchers v JOIN projects p ON p.id=v.project_id WHERE v.id ILIKE $1 LIMIT 12",
        [pattern],
      )
    ).rows;
    return [...projects, ...units, ...customers, ...partners, ...vouchers];
  });
}

import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  buildingSchema,
  defaultFeasibility,
  emptyBuilding,
  feasibilitySchema,
  parcelSchema,
  partySchema,
  type LandParcel,
  type SiteBuilding,
  type SitePartner,
} from "@baloch/shared";
import { z } from "zod";
import type pg from "pg";
import { pool, transaction } from "./db";

const read = { config: { permission: "projects" as const } };
const write = { config: { permission: "manageProjects" as const } };
const fail = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
const code = (request: FastifyRequest) =>
  z.object({ id: z.string().regex(/^P-\d+$/) }).parse(request.params).id;
type Site = {
  landParcels?: LandParcel[];
  sitePartners?: SitePartner[];
  building?: SiteBuilding;
  feasibility?: unknown;
};
async function project(client: Pick<pg.PoolClient, "query">, id: string, lock = false) {
  const result = await client.query(
    `SELECT id,name,details FROM projects WHERE code=$1 ${lock ? "FOR UPDATE" : ""}`,
    [id],
  );
  if (!result.rows.length) throw fail("Project not found.", 404);
  return result.rows[0] as { id: string; name: string; details: Site };
}
async function save(client: pg.PoolClient, id: string, key: string, value: unknown) {
  await client.query(
    "UPDATE projects SET details=jsonb_set(details,ARRAY[$2]::text[],$3::jsonb),updated_at=now() WHERE id=$1",
    [id, key, JSON.stringify(value)],
  );
}
const filesSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(255),
      content: z.string().base64().min(4).max(7_000_000),
    }),
  )
  .max(5)
  .refine(
    (files) => files.reduce((size, file) => size + file.content.length, 0) <= 7_000_000,
    "Attachments must total 5 MB or less.",
  );

export function registerProjectSite(app: FastifyInstance) {
  app.get("/api/projects/:id/site", read, async (request) => {
    const row = await project(pool, code(request));
    const { rows: sellers } = await pool.query(
      "SELECT id,name,type,phone,address,notes FROM parties WHERE type='seller' ORDER BY name",
    );
    return {
      parcels: row.details.landParcels ?? [],
      partners: row.details.sitePartners ?? [],
      sellers,
      building: row.details.building ?? emptyBuilding(row.name),
    };
  });
  app.post("/api/projects/:id/site/sellers", write, async (request) => {
    await project(pool, code(request));
    const data = partySchema.parse({ ...(request.body as object), type: "seller" });
    return (
      await pool.query(
        "INSERT INTO parties(name,type,phone,address,notes) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [data.name, data.type, data.phone, data.address, data.notes],
      )
    ).rows[0];
  });
  app.post("/api/projects/:id/site/partners", write, async (request) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(120) }).parse(request.body);
    return transaction(request.actor!.id, async (client) => {
      const row = await project(client, code(request), true);
      const partners = row.details.sitePartners ?? [];
      const existing = partners.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (existing) return existing;
      const partner = { id: randomUUID(), name };
      await save(client, row.id, "sitePartners", [...partners, partner]);
      return partner;
    });
  });
  app.put("/api/projects/:id/site/parcel", write, async (request) => {
    const { parcel, files } = z
      .object({ parcel: parcelSchema, files: filesSchema })
      .parse(request.body);
    return transaction(request.actor!.id, async (client) => {
      const row = await project(client, code(request), true);
      const parcels = row.details.landParcels ?? [];
      const existing = parcels.find((p) => p.id === parcel.id);
      if (parcel.acquisitionType === "purchase") {
        if (
          !(
            await client.query("SELECT 1 FROM parties WHERE id=$1 AND type='seller'", [
              parcel.sellerPartyId,
            ])
          ).rowCount
        )
          throw fail("Select a valid seller.");
      } else if (!row.details.sitePartners?.some((p) => p.id === parcel.contributingPartnerId)) {
        if (
          !(
            await client.query(
              "SELECT 1 FROM projects WHERE details->'partners' @> $1::jsonb LIMIT 1",
              [JSON.stringify([{ partnerId: parcel.contributingPartnerId }])],
            )
          ).rowCount
        )
          throw fail("Select a valid partner.");
      }
      const now = new Date().toISOString();
      const attachments = [...(existing?.attachments ?? [])];
      for (const file of files) {
        const stored = (
          await client.query(
            "INSERT INTO project_files(project_id,name,content) VALUES($1,$2,$3) RETURNING id,name",
            [row.id, file.name, file.content],
          )
        ).rows[0];
        attachments.push({ ...stored, uploadedAt: now });
      }
      const saved = {
        ...parcel,
        attachments,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await save(
        client,
        row.id,
        "landParcels",
        existing ? parcels.map((p) => (p.id === saved.id ? saved : p)) : [...parcels, saved],
      );
      return saved;
    });
  });
  app.put("/api/projects/:id/site/building", write, async (request) => {
    const building = buildingSchema.parse(request.body);
    return transaction(request.actor!.id, async (client) => {
      const row = await project(client, code(request), true);
      await save(client, row.id, "building", building);
      return building;
    });
  });
  app.post("/api/projects/:id/site/sync-sales", write, async (request) => {
    const { token } = z.object({ token: z.string().optional() }).parse(request.body);
    return transaction(request.actor!.id, async (client) => {
      const row = await project(client, code(request), true);
      const plan = row.details.feasibility
        ? feasibilitySchema.parse(row.details.feasibility)
        : defaultFeasibility();
      if (plan.status === "approved")
        throw fail("The feasibility baseline is approved. Unlock it before syncing.", 409);
      const units = row.details.building?.units ?? [];
      const normalize = (name: string) => name.trim().toLowerCase();
      if (!units.length || units.some((unit) => !unit.name.trim()))
        throw fail("Add a name for every unit type before syncing.");
      if (
        new Set(units.map((unit) => JSON.stringify([normalize(unit.name), unit.sizeSqft]))).size !==
        units.length
      )
        throw fail("Give rows with the same name and size distinct names before syncing.");
      const sales = [...plan.salesRows];
      if (sales.length === 1) {
        const [only] = sales;
        if (
          !only.buildingUnitId &&
          !only.unitType &&
          !only.count &&
          !only.areaSqft &&
          only.minRatePerSqft === undefined &&
          only.maxRatePerSqft === undefined &&
          only.priceOverride === undefined &&
          only.soldPercent === 100
        )
          sales.length = 0;
      }
      const changes = units.map((unit) => {
        const linked = sales.findIndex((s) => s.buildingUnitId === unit.id);
        const named = sales
          .map((s, index) => ({ s, index }))
          .filter(({ s }) => !s.buildingUnitId && normalize(s.unitType) === normalize(unit.name));
        const sized = named.filter(({ s }) => s.areaSqft === unit.sizeSqft);
        const candidates =
          sized.length || units.filter((u) => normalize(u.name) === normalize(unit.name)).length > 1
            ? sized
            : named;
        if (linked < 0 && candidates.length > 1)
          throw fail(
            "Multiple feasibility rows match " +
              unit.name +
              ". Rename the duplicate rows before syncing.",
            409,
          );
        const index = linked >= 0 ? linked : (candidates[0]?.index ?? -1);
        const old = sales[index];
        const values = {
          buildingUnitId: unit.id,
          unitType: unit.name,
          count: unit.count,
          areaSqft: unit.sizeSqft,
        };
        const updated = {
          ...(old ?? {
            id: randomUUID(),
            soldPercent: 100,
            minRatePerSqft: undefined,
            maxRatePerSqft: undefined,
          }),
          ...values,
        };
        if (old) sales[index] = updated;
        else sales.push(updated);
        return {
          before: old ? { name: old.unitType, count: old.count, area: old.areaSqft } : null,
          after: { name: unit.name, count: unit.count, area: unit.sizeSqft },
        };
      });
      const signature = createHash("sha256")
        .update(JSON.stringify([plan.updatedAt, units, changes]))
        .digest("hex");
      if (!token) return { token: signature, changes };
      if (token !== signature)
        throw fail("The building or feasibility changed. Review a fresh preview.", 409);
      const next = feasibilitySchema.parse({
        ...plan,
        salesRows: sales,
        updatedAt: new Date(
          Math.max(Date.now(), plan.updatedAt ? Date.parse(plan.updatedAt) + 1 : 0),
        ).toISOString(),
      });
      await save(client, row.id, "feasibility", next);
      return { token: signature, changes };
    });
  });
}

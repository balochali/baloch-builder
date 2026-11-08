import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildApp } from "../server/src/app";
import { pool } from "../server/src/db";
import { ownerPool } from "../server/src/migrate";

const url = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  throw Error("Use a local test database.");
const client = await ownerPool.connect();
try {
  await client.query("BEGIN");
  const { id: admin } = (
    await client.query("SELECT id FROM users WHERE active AND role='admin' LIMIT 1")
  ).rows[0];
  await client.query("SELECT set_config('app.actor_id',$1,true)", [admin]);
  const nonce = randomUUID();
  const name = "Verification partner " + nonce;
  const code = "P-" + Date.now();
  const oldId = randomUUID();
  const parcelId = randomUUID();
  const master = (
    await client.query("INSERT INTO partners(name,role) VALUES($1,'Partner') RETURNING id", [name])
  ).rows[0];
  await client.query("INSERT INTO projects(name,code,details,created_by) VALUES($1,$2,$3,$4)", [
    "Verification project " + nonce,
    code,
    JSON.stringify({
      sitePartners: [{ id: oldId, name: " " + name.toUpperCase() + " " }],
      landParcels: [{ id: parcelId, contributingPartnerId: oldId }],
      feasibility: { partners: [{ name, partnerId: oldId, capital: 125, profitSharePercent: 25 }] },
    }),
    admin,
  ]);
  const migration = await readFile(
    new URL("../server/migrations/021_master_partner_identity.sql", import.meta.url),
    "utf8",
  );
  await client.query(migration);
  const { details } = (await client.query("SELECT details FROM projects WHERE code=$1", [code]))
    .rows[0];
  assert.equal(details.sitePartners, undefined);
  assert.equal(details.landParcels[0].contributingPartnerId, master.id);
  assert.deepEqual(details.feasibility.partners[0], {
    name,
    partnerId: master.id,
    capital: 125,
    profitSharePercent: 25,
  });
  assert.equal(
    (
      await client.query(
        "SELECT count(*)::int AS n FROM partners WHERE lower(btrim(name))=lower($1)",
        [name],
      )
    ).rows[0].n,
    1,
  );
  await client.query("SAVEPOINT duplicate_test");
  await assert.rejects(
    client.query("INSERT INTO partners(name,role) VALUES($1,'Partner')", [
      " " + name.toUpperCase() + " ",
    ]),
    { code: "23505" },
  );
  await client.query("ROLLBACK TO SAVEPOINT duplicate_test");

  const token = randomUUID();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await client.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
    [tokenHash, admin],
  );
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  pool.query = client.query.bind(client) as typeof pool.query;
  pool.connect = (async () => ({
    query: (sql: string, values?: unknown[]) =>
      client.query(
        sql === "BEGIN"
          ? "SAVEPOINT route_tx"
          : sql === "COMMIT"
            ? "RELEASE SAVEPOINT route_tx"
            : sql === "ROLLBACK"
              ? "ROLLBACK TO SAVEPOINT route_tx"
              : sql,
        values,
      ),
    release: () => {},
  })) as unknown as typeof pool.connect;
  try {
    const app = await buildApp();
    try {
      const headers = { cookie: "session=" + token, "x-requested-with": "BalochBuilder" };
      const saved = await app.inject({
        method: "PUT",
        url: `/api/projects/${code}/site/parcel`,
        headers,
        payload: {
          parcel: {
            id: parcelId,
            name: "Verification plot",
            address: "",
            mapLink: "",
            area: { value: 1, unit: "Kanal" },
            acquisitionType: "partner_contribution",
            contributingPartnerId: master.id,
            stage: "Identified",
            agreementRef: "",
            agreementDate: "",
            facing: "",
            notes: "",
          },
          files: [],
        },
      });
      assert.equal(saved.statusCode, 200, saved.body);
      assert.equal(saved.json().contributingPartnerId, master.id);
    } finally {
      await app.close();
    }
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
  }
  console.log(
    "PostgreSQL partner checks passed: migration collapse, active-name uniqueness and contributed parcel save.",
  );
} finally {
  await client.query("ROLLBACK");
  client.release();
  await ownerPool.end();
  await pool.end();
}

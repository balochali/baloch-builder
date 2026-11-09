import { testLandPostgres } from "./testLandPostgres";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildApp } from "../server/src/app";
import { pool } from "../server/src/db";
import { ownerPool } from "../server/src/migrate";

const url = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  throw Error("Use a local test database.");
const ownerUrl = new URL(process.env.OWNER_DATABASE_URL ?? "postgres://invalid");
if (ownerUrl.host !== url.host || ownerUrl.pathname !== url.pathname)
  throw Error("Point both roles at the same local database.");
const partnerOnly = process.argv.includes("--partner-only");
if (!partnerOnly) {
  for (const table of [
    "land_purchases",
    "land_payments",
    "land_payment_sources",
    "land_costs",
    "land_contributions",
  ]) {
    await assert.rejects(pool.query(`UPDATE ${table} SET id=id WHERE false`), { code: "42501" });
    await assert.rejects(pool.query(`DELETE FROM ${table} WHERE false`), { code: "42501" });
  }
  await assert.rejects(pool.query("UPDATE journal_lines SET debit=0 WHERE false"), {
    code: "42501",
  });
  await assert.rejects(pool.query("DELETE FROM journal_lines WHERE false"), { code: "42501" });
  await assert.rejects(pool.query("UPDATE journal_vouchers SET narration='changed' WHERE false"), {
    code: "42501",
  });
}
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
      if (!partnerOnly) {
        await client.query("CREATE TEMP SEQUENCE journal_voucher_number START WITH 900000000");
        await client.query("SAVEPOINT unbalanced");
        await client.query(
          "INSERT INTO journal_vouchers(id,date,narration,type,source) VALUES('JV-UNBALANCED',CURRENT_DATE,'Test','regular','{}')",
        );
        await client.query(
          "INSERT INTO journal_lines(voucher_id,account_code,debit,credit) VALUES('JV-UNBALANCED','1010',100,0),('JV-UNBALANCED','3000',0,99)",
        );
        await assert.rejects(
          client.query("SET CONSTRAINTS ALL IMMEDIATE"),
          /balanced debit and credit/,
        );
        await client.query("ROLLBACK TO SAVEPOINT unbalanced");
        const funding = `/api/projects/${code}/funding`;
        const data = {
          date: "2026-11-08",
          amount: 100,
          account: "company_bank",
          refNo: "",
          notes: "",
          sourceType: "partner",
          purpose: "General",
          partnerId: master.id,
        };
        const post = async (payload: object) => {
          const response = await app.inject({ method: "POST", url: funding, headers, payload });
          assert.equal(response.statusCode, 200, response.body);
          await client.query("SET CONSTRAINTS ALL IMMEDIATE");
          await client.query("SET CONSTRAINTS ALL DEFERRED");
          return response.json();
        };
        const first = await post({ direction: "in", data });
        const changed = await post({
          direction: "in",
          data: { ...data, amount: 200 },
          replaceId: first.id,
        });
        const partners = await app.inject({ method: "GET", url: "/api/partners", headers });
        assert.equal(partners.statusCode, 200, partners.body);
        const summary = partners.json().find((p: { id: string }) => p.id === master.id);
        assert.deepEqual(
          [
            summary.committed,
            summary.contributed,
            summary.returned,
            summary.pending,
            summary.projectCount,
          ],
          [125, 200, 0, 0, 1],
        );
        const voidEntry = () =>
          app.inject({
            method: "POST",
            url: funding + `/${changed.id}/void`,
            headers,
            payload: { reason: "Verification" },
          });
        const result = await voidEntry();
        assert.equal(result.statusCode, 200, result.body);
        await client.query("SET CONSTRAINTS ALL IMMEDIATE");
        const again = await voidEntry();
        assert.equal(again.statusCode, 409);
        assert.match(again.body, /cannot be voided|already void/i);
        const { rows: reversals } = await client.query(
          "SELECT reversal_of FROM journal_vouchers WHERE reversal_of=ANY($1)",
          [[first.voucherId, changed.voucherId]],
        );
        assert.deepEqual(
          new Set(reversals.map((row) => row.reversal_of)),
          new Set([first.voucherId, changed.voucherId]),
        );
        await testLandPostgres(client, app, headers, code, master.id);
        console.log(
          "PostgreSQL ledger checks passed: runtime privileges, deferred balance, post, edit, void and repeated void.",
        );
      }
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

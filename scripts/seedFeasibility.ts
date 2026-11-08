import { createHash } from "node:crypto";
import type pg from "pg";
import { postFundingEntry } from "../server/src/funding";
import { formatPKR, formatPercent } from "../src/features/projects/feasibilityFormat";
import { pool, transaction, assertRuntimeRole } from "../server/src/db";
import { emptyBuilding, feasibilitySchema } from "@baloch/shared";
import { sampleFeasibility } from "../src/features/projects/sampleFeasibility";
import { calculateFeasibility } from "../src/features/projects/feasibilityCalc";

const name = "Baloch Heights";
function verify(plan: ReturnType<typeof feasibilitySchema.parse>) {
  const totals = calculateFeasibility(plan);
  const rows: { figure: string; expected: number | string; computed: number | string }[] = [];
  const add = (figure: string, expected: number | string, computed: number | string) =>
    rows.push({ figure, expected, computed });
  function money(label: string, expected: number, computed: number, short?: string) {
    add(label, expected, computed);
    if (short) add(label + " display", short, formatPKR(computed));
  }
  function checkRange(
    label: string,
    expected: [number, number],
    computed: { min: number; max: number },
    display: [string, string],
  ) {
    money(label + " min", expected[0], computed.min, display[0]);
    money(label + " max", expected[1], computed.max, display[1]);
  }
  const categories = [
    [63600000, 63750000, "6.36 C", "6.38 C"],
    [2600000, 3250000, "26 L", "32.5 L"],
    [53000000, 64500000, "5.3 C", "6.45 C"],
    [16000000, 19000000, "1.6 C", "1.9 C"],
    [4000000, 5000000, "40 L", "50 L"],
    [2800000, 4200000, "28 L", "42 L"],
    [2800000, 4200000, "28 L", "42 L"],
    [7240000, 8195000, "72.4 L", "81.95 L"],
  ] as const;
  categories.forEach(([min, max, minShort, maxShort], i) =>
    checkRange(plan.costCategories[i].name, [min, max], totals.subtotals[i], [minShort, maxShort]),
  );
  checkRange("Total estimated cost", [152040000, 172095000], totals.cost, ["15.2 C", "17.21 C"]);
  checkRange("Total sales value", [196900000, 226150000], totals.value, ["19.69 C", "22.62 C"]);
  checkRange("Expected sales", [190300000, 218050000], totals.expected, ["19.03 C", "21.81 C"]);
  add("Total units", 19, totals.units);
  money("Worst profit", 18205000, totals.profit.worst, "1.82 C");
  money("Best profit", 66010000, totals.profit.best, "6.6 C");
  add("Worst margin", "9.57%", formatPercent(totals.margin.worst));
  add("Best margin", "30.27%", formatPercent(totals.margin.best));
  add("Worst break-even", "87.40%", formatPercent(totals.breakEven.worst));
  add("Best break-even", "67.23%", formatPercent(totals.breakEven.best));
  money("Partner capital", 130000000, totals.capital, "13 C");
  checkRange("Funding gap", [22040000, 42095000], totals.gap, ["2.2 C", "4.21 C"]);
  add("Profit share total", "100.00%", formatPercent(totals.share));
  (
    [
      ["46.15%", "40.00%", 7282000, 26404000, "12.14%", "44.01%"],
      ["30.77%", "35.00%", 6371750, 23103500, "15.93%", "57.76%"],
      ["23.08%", "25.00%", 4551250, 16502500, "15.17%", "55.01%"],
    ] as const
  ).forEach(([capital, share, worst, best, worstRoi, bestRoi], i) => {
    const partner = plan.partners[i].name;
    const result = totals.returns[i];
    add(partner + " capital %", capital, formatPercent(result.capitalPercent));
    add(partner + " profit share %", share, formatPercent(result.share));
    money(partner + " worst profit", worst, result.worst.gain);
    money(partner + " best profit", best, result.best.gain);
    add(partner + " worst ROI", worstRoi, formatPercent(result.worst.roi));
    add(partner + " best ROI", bestRoi, formatPercent(result.best.roi));
  });
  console.table(rows);
  if (rows.some((row) => row.expected !== row.computed))
    throw new Error("Feasibility verification failed.");
}

const demo = process.argv.includes("--demo");
function stableId(projectId: string, key: string) {
  const h = createHash("sha256")
    .update(projectId + ":" + key)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
async function masterPartner(client: pg.PoolClient, name: string, owner = false) {
  const query = owner
    ? "SELECT id,name FROM partners WHERE role='Owner'"
    : "SELECT id,name FROM partners WHERE status='Active' AND lower(btrim(name))=lower(btrim($1))";
  const parameters = owner ? [] : [name];
  let row = (await client.query(query, parameters)).rows[0];
  if (!row) {
    await client.query("INSERT INTO partners(name,role) VALUES($1,$2) ON CONFLICT DO NOTHING", [
      name,
      owner ? "Owner" : "Partner",
    ]);
    row = (await client.query(query, parameters)).rows[0];
  }
  if (!row) throw new Error("Could not link demo partner " + name);
  return row as { id: string; name: string };
}
async function seedProjectDemo(
  client: pg.PoolClient,
  project: { id: string; details: Record<string, unknown> },
  br: string,
  ap: string,
) {
  const sid = (key: string) => stableId(project.id, key);
  async function contact(type: "seller" | "lender", name: string) {
    const existing = (
      await client.query("SELECT id FROM parties WHERE type=$1 AND name=$2 LIMIT 1", [type, name])
    ).rows[0];
    return (
      existing ??
      (
        await client.query("INSERT INTO parties(name,type) VALUES($1,$2) RETURNING id", [
          name,
          type,
        ])
      ).rows[0]
    ).id as string;
  }
  const seller = await contact("seller", "Demo land seller");
  const lender = await contact("lender", "Demo lender");
  const now = new Date().toISOString();
  const base = {
    address: "Islamabad",
    mapLink: "",
    area: { value: 1, unit: "Kanal" },
    stage: "Identified",
    agreementRef: "",
    agreementDate: "",
    facing: "",
    notes: "Demo parcel",
    createdAt: now,
    updatedAt: now,
    attachments: [],
  };
  const parcels = Array.isArray(project.details.landParcels) ? project.details.landParcels : [];
  for (const parcel of [
    {
      ...base,
      id: sid("seller-parcel"),
      name: "Plot 1",
      acquisitionType: "purchase",
      sellerPartyId: seller,
    },
    {
      ...base,
      id: sid("partner-parcel"),
      name: "Plot 2",
      acquisitionType: "partner_contribution",
      contributingPartnerId: ap,
    },
  ])
    if (!parcels.some((p) => p.id === parcel.id)) parcels.push(parcel);
  const building = project.details.building ?? {
    ...emptyBuilding(name),
    buildingType: "Flats + shops (mixed)",
    floorsAboveGround: 5,
    coveredAreaPerFloor: 4000,
    floors: ["Ground", "1st", "2nd", "3rd", "4th"].map((label, i) => ({
      id: sid("floor-" + i),
      label,
      use: i === 0 ? "Shops" : "Flats",
      unitCount: i === 0 ? 4 : i === 4 ? 3 : 4,
      floorAreaSqft: 4000,
      notes: "",
      generatedKey: i === 0 ? "ground" : "floor-" + (i - 1),
    })),
    units: [
      {
        id: sid("2bed"),
        category: "Flat",
        name: "2-bed flat",
        count: 10,
        sizeSqft: 900,
        bedrooms: 2,
        bathrooms: 2,
        kitchens: 1,
        lounges: 1,
        balconies: 1,
        floorsText: "1st-4th",
        notes: "",
      },
      {
        id: sid("3bed"),
        category: "Flat",
        name: "3-bed flat",
        count: 5,
        sizeSqft: 1300,
        bedrooms: 3,
        bathrooms: 2,
        kitchens: 1,
        lounges: 1,
        balconies: 1,
        floorsText: "1st-4th",
        notes: "",
      },
      {
        id: sid("shop"),
        category: "Shop",
        name: "Shop",
        count: 4,
        sizeSqft: 300,
        bedrooms: 0,
        bathrooms: 0,
        kitchens: 0,
        lounges: 0,
        balconies: 0,
        floorsText: "Ground",
        notes: "",
      },
    ],
  };
  await client.query("UPDATE projects SET details=details || $2::jsonb WHERE id=$1", [
    project.id,
    JSON.stringify({ landParcels: parcels, building }),
  ]);
  const common = {
    date: "2026-11-08",
    account: "company_bank" as const,
    refNo: "Demo",
    notes: "Demo funding scenario",
  };
  const entries = [
    [
      "br",
      {
        direction: "in",
        data: {
          ...common,
          sourceType: "partner",
          purpose: "Land",
          partnerId: br,
          amount: 10_000_000,
        },
      },
    ],
    [
      "owner",
      {
        direction: "in",
        data: {
          ...common,
          sourceType: "owner",
          purpose: "General",
          account: "company_cash",
          amount: 5_000_000,
        },
      },
    ],
    [
      "loan",
      {
        direction: "in",
        data: {
          ...common,
          sourceType: "loan",
          purpose: "Construction",
          lenderPartyId: lender,
          loanTerms: { loanType: "Bank loan", dueDate: "" },
          amount: 20_000_000,
        },
      },
    ],
    [
      "return",
      {
        direction: "out",
        data: { ...common, kind: "capital_return", partnerId: br, amount: 2_000_000 },
      },
    ],
    [
      "principal",
      {
        direction: "out",
        data: { ...common, kind: "loan_principal", loanFundingId: sid("loan"), amount: 5_000_000 },
      },
    ],
    [
      "markup",
      {
        direction: "out",
        data: { ...common, kind: "loan_markup", loanFundingId: sid("loan"), amount: 500_000 },
      },
    ],
  ] satisfies [string, Parameters<typeof postFundingEntry>[2]][];
  for (const [key, entry] of entries) {
    const id = sid(key);
    if (!(await client.query("SELECT 1 FROM project_money_entries WHERE id=$1", [id])).rowCount)
      await postFundingEntry(client, project.id, entry, id);
  }
}
try {
  if (!process.env.DATABASE_URL)
    throw new Error("Configure DATABASE_URL in .env.local before seeding.");
  const database = new URL(process.env.DATABASE_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(database.hostname))
    throw new Error("The sample seed requires the local app database.");
  await assertRuntimeRole();
  const actor = (
    await pool.query(
      "SELECT id FROM users WHERE active AND role='admin' ORDER BY (username='admin') DESC NULLS LAST,id LIMIT 1",
    )
  ).rows[0];
  if (!actor) throw new Error("Create an active administrator before seeding.");
  const code = await transaction(actor.id, async (client) => {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('seed:baloch-heights:feasibility'))");
    let project = (
      await client.query(
        "SELECT id,code,details FROM projects WHERE lower(btrim(name))=lower($1) FOR UPDATE",
        [name],
      )
    ).rows[0];
    if (!project) {
      project = (
        await client.query(
          "INSERT INTO projects(name,created_by,details,draft) VALUES($1,$2,$3::jsonb,false) RETURNING id,code,details",
          [
            name,
            actor.id,
            JSON.stringify({
              status: "Planning",
              type: "Apartments",
              city: "Islamabad",
              landArea: { value: 1, unit: "Kanal" },
            }),
          ],
        )
      ).rows[0];
    }
    const owner = await masterPartner(client, "Owner", true);
    const partners = [];
    for (const row of sampleFeasibility.feasibility.partners) {
      const master = await masterPartner(client, row.name);
      partners.push({ ...row, partnerId: master.id, name: master.name });
    }
    for (const partnerId of [owner.id, ...partners.map((row) => row.partnerId)])
      await client.query(
        "INSERT INTO project_partner_links(project_id,partner_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [project.id, partnerId],
      );
    if (demo) await seedProjectDemo(client, project, partners[1].partnerId, partners[0].partnerId);
    const plan = feasibilitySchema.parse({
      ...sampleFeasibility.feasibility,
      partners,
      costCategories: sampleFeasibility.feasibility.costCategories.map((category) =>
        category.id === "c4" ? { ...category, contractor: true } : category,
      ),
      updatedAt: new Date().toISOString(),
    });
    await client.query(
      "UPDATE projects SET details=jsonb_set(details,'{feasibility}',$2::jsonb),updated_at=now() WHERE code=$1",
      [project.code, JSON.stringify(plan)],
    );
    const stored = (
      await client.query("SELECT details->'feasibility' AS plan FROM projects WHERE code=$1", [
        project.code,
      ])
    ).rows[0];
    verify(feasibilitySchema.parse(stored.plan));
    return project.code as string;
  });
  console.log(
    `Seeded ${name} (${code}) in PostgreSQL at ${database.hostname}:${database.port || "5432"}${database.pathname}`,
  );
} catch (error) {
  if ((error as { code?: string }).code === "55P03")
    console.error("The project is locked. Close the app and run npm run seed:feasibility again.");
  else console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}

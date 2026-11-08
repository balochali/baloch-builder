import { formatPKR, formatPercent } from "../src/features/projects/feasibilityFormat";
import { pool, transaction, assertRuntimeRole } from "../server/src/db";
import { feasibilitySchema } from "@baloch/shared";
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
        "SELECT code FROM projects WHERE lower(btrim(name))=lower($1) FOR UPDATE",
        [name],
      )
    ).rows[0];
    if (!project) {
      project = (
        await client.query(
          "INSERT INTO projects(name,created_by,details,draft) VALUES($1,$2,$3::jsonb,false) RETURNING code",
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
    const plan = feasibilitySchema.parse({
      ...sampleFeasibility.feasibility,
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

import { postVoucher } from "../src/journal";
import { defaultFeasibility, emptyBuilding, type FeasibilityData } from "@baloch/shared";
import { afterEach, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { pool, transaction } from "../src/db";
vi.mock("../src/db", () => ({ pool: { query: vi.fn() }, transaction: vi.fn(), audit: vi.fn() }));
afterEach(() => vi.resetAllMocks());
it("keeps authenticated identity and removes business endpoints", async () => {
  vi.mocked(pool.query).mockResolvedValue({
    rows: [{ id: "admin-id", email: "admin@example.test", role: "admin" }],
  } as never);
  const app = await buildApp();
  try {
    expect((await app.inject({ url: "/api/health" })).statusCode).toBe(200);
    const identity = await app.inject({ url: "/api/me", headers: { cookie: "session=test" } });
    expect(identity.statusCode).toBe(200);
    expect(identity.json().role).toBe("admin");
    for (const route of ["vouchers", "settings", "cost-heads", "users"]) {
      expect(
        (await app.inject({ url: `/api/${route}`, headers: { cookie: "session=test" } }))
          .statusCode,
      ).toBe(404);
    }
  } finally {
    await app.close();
  }
});
it("still requires authentication", async () => {
  vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
  const app = await buildApp();
  try {
    expect((await app.inject({ url: "/api/me" })).statusCode).toBe(401);
  } finally {
    await app.close();
  }
});

it("validates project names and saves drafts with the signed-in actor", async () => {
  vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: "admin-id", role: "admin" }] } as never);
  const query = vi.fn().mockResolvedValue({
    rows: [{ id: "new-project", name: "Baloch Heights", created_at: "2026-11-06" }],
  });
  vi.mocked(transaction).mockImplementation(async (_actor, run) => run({ query } as never));
  const app = await buildApp();
  const headers = { cookie: "session=test", "x-requested-with": "BalochBuilder" };
  try {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/projects",
          headers,
          payload: { name: "   " },
        })
      ).statusCode,
    ).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { name: "  Baloch Heights  " },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe("Baloch Heights");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO projects"), [
      "Baloch Heights",
      "admin-id",
    ]);
  } finally {
    await app.close();
  }
});
it("rejects project creation for a construction account", async () => {
  vi.mocked(pool.query).mockResolvedValue({
    rows: [{ id: "worker-id", role: "construction" }],
  } as never);
  const app = await buildApp();
  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { cookie: "session=test", "x-requested-with": "BalochBuilder" },
      payload: { name: "Tower" },
    });
    expect(response.statusCode).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});

it("previews sales sync, preserves rates and sold percentages, and refuses an approved plan", async () => {
  const building = emptyBuilding("Baloch Heights");
  building.units.push({
    id: "d987df21-1d83-420c-b96e-47ae52579848",
    category: "Flat",
    name: "2-bed flat",
    count: 10,
    sizeSqft: 900,
    bedrooms: 2,
    bathrooms: 2,
    kitchens: 1,
    lounges: 1,
    balconies: 1,
    floorsText: "",
    notes: "",
  });
  const plan = defaultFeasibility();
  plan.salesRows[0] = {
    ...plan.salesRows[0],
    unitType: "2-bed flat",
    count: 8,
    areaSqft: 900,
    minRatePerSqft: 11000,
    maxRatePerSqft: 12500,
    soldPercent: 75,
  };
  const details = { building, feasibility: plan };
  vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: "admin-id", role: "admin" }] } as never);
  const query = vi.fn(async (sql: string, args?: unknown[]) => {
    if (sql.startsWith("UPDATE"))
      details.feasibility = JSON.parse(String(args?.[2])) as FeasibilityData;
    return { rows: [{ id: "project-id", name: "Baloch Heights", details }] };
  });
  vi.mocked(transaction).mockImplementation(async (_actor, run) => run({ query } as never));
  const app = await buildApp();
  try {
    const headers = { cookie: "session=test", "x-requested-with": "BalochBuilder" };
    const send = (payload: object) =>
      app.inject({ method: "POST", url: "/api/projects/P-001/site/sync-sales", headers, payload });
    const preview = await send({});
    expect(preview.statusCode).toBe(200);
    expect(details.feasibility.salesRows[0].count).toBe(8);
    expect((await send({ token: "stale" })).statusCode).toBe(409);
    expect((await send({ token: preview.json().token })).statusCode).toBe(200);
    expect(details.feasibility.salesRows).toHaveLength(1);
    expect(details.feasibility.salesRows[0]).toMatchObject({
      buildingUnitId: building.units[0].id,
      count: 10,
      areaSqft: 900,
      minRatePerSqft: 11000,
      maxRatePerSqft: 12500,
      soldPercent: 75,
    });
    details.feasibility.status = "approved";
    expect((await send({})).statusCode).toBe(409);
    expect(details.feasibility.status).toBe("approved");
  } finally {
    await app.close();
  }
});

it("rejects missing or inactive posting accounts before writing a voucher", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [{ code: "1010" }] });
  await expect(
    postVoucher({ query } as never, {
      date: "2026-11-08",
      narration: "Verification",
      source: { module: "test", refId: "1" },
      lines: [
        { accountCode: "1010", debit: 100, credit: 0 },
        { accountCode: "3000", debit: 0, credit: 100 },
      ],
    }),
  ).rejects.toThrow("Every account must exist and be active.");
  expect(query).toHaveBeenCalledTimes(1);
  expect(query).toHaveBeenCalledWith(expect.stringContaining("is_active"), [
    ["1010", "3000"],
    false,
  ]);
});

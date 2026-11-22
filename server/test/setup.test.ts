import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
const mocks = vi.hoisted(() => ({ query: vi.fn(), seed: vi.fn() }));
vi.mock("../src/db", () => ({ pool: { query: mocks.query } }));
vi.mock("../src/seed", () => ({ seed: mocks.seed }));
import { registerSetup } from "../src/setup";
import rateLimit from "@fastify/rate-limit";
describe("first-run setup routes", () => {
  beforeEach(() => vi.resetAllMocks());
  it("reports setup needed, creates once, and preserves the conflict response", async () => {
    const app = Fastify();
    await app.register(rateLimit);
    app.addHook("preHandler", async (r) => {
      if (r.method === "POST" && r.headers["x-requested-with"] !== "BalochBuilder")
        throw Object.assign(new Error("CSRF"), { statusCode: 403 });
    });
    registerSetup(app);
    mocks.query.mockResolvedValue({ rowCount: 0 });
    expect((await app.inject("/api/setup-status")).json()).toEqual({ needed: true });
    const payload = {
      companyName: "Builder",
      fullName: "Administrator",
      username: "owner",
      email: "owner@example.com",
      password: "long-test-password",
      confirm: "long-test-password",
    };
    expect((await app.inject({ method: "POST", url: "/api/setup", payload })).statusCode).toBe(403);
    mocks.seed
      .mockResolvedValueOnce("admin")
      .mockRejectedValueOnce(Object.assign(new Error("Already exists"), { statusCode: 409 }));
    const request = {
      method: "POST" as const,
      url: "/api/setup",
      headers: { "x-requested-with": "BalochBuilder" },
      payload,
    };
    expect((await app.inject(request)).statusCode).toBe(201);
    expect((await app.inject(request)).statusCode).toBe(409);
    expect(mocks.seed).toHaveBeenCalledWith(
      "owner",
      "owner@example.com",
      "long-test-password",
      payload,
    );
    mocks.query.mockResolvedValue({ rowCount: 1 });
    expect((await app.inject("/api/setup-status")).json()).toEqual({ needed: false });
    mocks.seed.mockRejectedValue(Object.assign(new Error("Already exists"), { statusCode: 409 }));
    for (let i = 0; i < 5; i++) await app.inject(request);
    expect((await app.inject(request)).statusCode).toBe(429);
    await app.close();
  });
});

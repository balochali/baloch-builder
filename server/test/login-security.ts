import { describe, it, expect, vi } from "vitest";
import argon2 from "argon2";
import { buildApp } from "../src/app";
import { parseTrustProxy } from "../src/auth-security";
import { pool } from "../src/db";

export function registerLoginSecurityTests() {
  const login = (
    app: Awaited<ReturnType<typeof buildApp>>,
    forwarded = "198.51.100.1",
    email = "missing@example.test",
  ) =>
    app.inject({
      method: "POST",
      url: "/api/login",
      remoteAddress: "127.0.0.1",
      headers: { "x-requested-with": "BalochBuilder", "x-forwarded-for": forwarded },
      payload: { email, password: "incorrect-password" },
    });
  describe("proxy and login hardening", () => {
    it("parses explicit trust and rejects unrestricted or malformed values", () => {
      expect(parseTrustProxy("off")).toBe(false);
      const oneHop = parseTrustProxy("1");
      expect(typeof oneHop).toBe("function");
      if (typeof oneHop === "function") {
        expect(oneHop("127.0.0.1", 0)).toBe(true);
        expect(oneHop("198.51.100.1", 1)).toBe(false);
      }
      expect(parseTrustProxy("127.0.0.1,::1,10.0.0.0/8")).toEqual([
        "127.0.0.1",
        "::1",
        "10.0.0.0/8",
      ]);
      for (const value of ["true", "*", "-1", "999", "10.0.0.1/99", "hostname", "127.0.0.1,"])
        expect(() => parseTrustProxy(value)).toThrow("TRUST_PROXY");
    });
    it("separates clients forwarded by a trusted proxy and separates emails", async () => {
      const app = await buildApp({ trustProxy: "127.0.0.1" });
      try {
        for (let i = 0; i < 5; i++) expect((await login(app)).statusCode).toBe(401);
        expect((await login(app)).statusCode).toBe(429);
        expect((await login(app, "198.51.100.2")).statusCode).toBe(401);
        expect((await login(app, "198.51.100.1", "another@example.test")).statusCode).toBe(401);
      } finally {
        await app.close();
      }
    });
    it.each(["off", "192.0.2.10"])(
      "ignores spoofed forwarding with trust %s",
      async (trustProxy) => {
        const app = await buildApp({ trustProxy });
        try {
          for (let i = 0; i < 5; i++)
            expect((await login(app, `198.51.100.${i + 1}`)).statusCode).toBe(401);
          expect((await login(app, "203.0.113.1")).statusCode).toBe(429);
        } finally {
          await app.close();
        }
      },
    );
    it("caps email rotation per IP and only audits accepted login attempts", async () => {
      const app = await buildApp({ trustProxy: "off" });
      const before = Number(
        (await pool.query("SELECT count(*) FROM audit_log WHERE action='login_failed'")).rows[0]
          .count,
      );
      try {
        for (let i = 0; i < 30; i++)
          expect((await login(app, "198.51.100.1", `rotate${i}@example.test`)).statusCode).toBe(
            401,
          );
        expect((await login(app, "198.51.100.1", "rotate31@example.test")).statusCode).toBe(429);
        const after = Number(
          (await pool.query("SELECT count(*) FROM audit_log WHERE action='login_failed'")).rows[0]
            .count,
        );
        expect(after - before).toBe(30);
      } finally {
        await app.close();
      }
    });
    it("verifies a dummy hash for unknown emails with comparable timing", async () => {
      const app = await buildApp({ trustProxy: "127.0.0.1" });
      const verify = vi.spyOn(argon2, "verify");
      const known: number[] = [],
        unknown: number[] = [];
      try {
        for (let i = 0; i < 6; i++) {
          // Alternate the order and use fresh IPs to avoid rate limits skewing timing.
          for (const missing of i % 2 ? [true, false] : [false, true]) {
            const start = performance.now();
            expect(
              (
                await login(
                  app,
                  `198.51.100.${i + 20}`,
                  missing ? "timing-missing@example.test" : "accountant@example.test",
                )
              ).statusCode,
            ).toBe(401);
            if (i > 0) (missing ? unknown : known).push(performance.now() - start);
          }
        }
        expect(verify).toHaveBeenCalledTimes(12);
        const median = (values: number[]) => values.sort((a, b) => a - b)[2];
        const ratio = median(known) / median(unknown);
        expect(ratio).toBeGreaterThan(1 / 6);
        expect(ratio).toBeLessThan(6);
      } finally {
        verify.mockRestore();
        await app.close();
      }
    });
    it("does not audit unauthenticated non-login spam or store oversized emails", async () => {
      const app = await buildApp();
      try {
        const before = (await pool.query("SELECT count(*) FROM audit_log")).rows[0].count;
        for (let i = 0; i < 20; i++)
          expect((await app.inject({ url: "/api/accounts" })).statusCode).toBe(401);
        expect(
          (await login(app, "198.51.100.1", "a".repeat(300) + "@example.test")).statusCode,
        ).toBe(400);
        expect((await pool.query("SELECT count(*) FROM audit_log")).rows[0].count).toBe(before);
      } finally {
        await app.close();
      }
    });
  });
}

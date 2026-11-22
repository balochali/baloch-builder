import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "./db";
import { seed } from "./seed";
export function registerSetup(app: FastifyInstance) {
  app.get("/api/setup-status", { config: { public: true } }, async () => ({
    needed: !(await pool.query("SELECT 1 FROM users LIMIT 1")).rowCount,
  }));
  app.post(
    "/api/setup",
    { config: { public: true, rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if ((await pool.query("SELECT 1 FROM users LIMIT 1")).rowCount)
        throw Object.assign(new Error("Setup is already complete"), { statusCode: 409 });
      const d = z
        .object({
          companyName: z.string().trim().min(1).max(150),
          fullName: z.string().trim().min(1).max(150),
          username: z
            .string()
            .trim()
            .regex(/^[a-zA-Z0-9_.-]{3,64}$/),
          email: z.string().email().max(254),
          password: z.string().min(12).max(256),
          confirm: z.string(),
        })
        .refine((d) => d.password === d.confirm, {
          message: "Passwords must match",
          path: ["confirm"],
        })
        .parse(request.body);
      await seed(d.username, d.email, d.password, d);
      return reply.code(201).send({ ready: true });
    },
  );
  app.post("/api/desktop-authorize", async (request) => {
    if (request.actor?.role !== "admin")
      throw Object.assign(new Error("Administrator access required"), { statusCode: 403 });
    if (!process.env.DESKTOP_CONTROL_TOKEN)
      throw Object.assign(new Error("Desktop data tools are unavailable in development"), {
        statusCode: 404,
      });
    return { token: process.env.DESKTOP_CONTROL_TOKEN };
  });
}

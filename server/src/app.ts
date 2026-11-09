import { registerLand } from "./landRoutes";
import { registerFunding } from "./funding";
import { registerProjectRoutes } from "./projects";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import argon2 from "argon2";
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { TOTP, Secret } from "otpauth";
import { z } from "zod";
import { can, type Permission, type Role } from "@baloch/shared";
import { pool, transaction, audit } from "./db";
import { cleanupExpiredSessions } from "./sessions";
import { parseTrustProxy, loginEmail } from "./auth-security";
type Actor = { id: string; email: string; role: Role };
declare module "fastify" {
  interface FastifyRequest {
    actor: Actor | null;
  }
  interface FastifyContextConfig {
    permission?: Permission;
    public?: boolean;
  }
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const actor = (r: FastifyRequest) => r.actor!;
const fail = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
function cryptSecret(value: string, decrypt = false) {
  const key = Buffer.from(process.env.TOTP_ENCRYPTION_KEY ?? "", "hex");
  if (key.length !== 32) throw fail("TOTP encryption key is not configured", 503);
  if (decrypt) {
    const [iv, tag, data] = value.split(".").map((s) => Buffer.from(s, "hex"));
    const c = createDecipheriv("aes-256-gcm", key, iv);
    c.setAuthTag(tag);
    return Buffer.concat([c.update(data), c.final()]).toString();
  }
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(value), c.final()]);
  return [iv, c.getAuthTag(), data].map((v) => v.toString("hex")).join(".");
}
function validTotp(secret: string, token: string, lastStep: string | null) {
  const totp = new TOTP({
    secret: Secret.fromBase32(cryptSecret(secret, true)),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });
  const delta = totp.validate({ token, window: 1 });
  if (delta === null) return null;
  const step = Math.floor(Date.now() / 30000) + delta;
  return step > Number(lastStep ?? 0) ? step : null;
}
export async function buildApp(options: { trustProxy?: string } = {}) {
  const app = Fastify({
    logger: false,
    bodyLimit: 15 * 1024 * 1024,
    trustProxy: parseTrustProxy(options.trustProxy),
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  // Independent counters: the IP budget cannot be evaded by rotating emails.
  const ipLoginLimit = app.createRateLimit({
    max: 30,
    timeWindow: "1 minute",
    keyGenerator: (r) => r.ip,
  });
  const emailLoginLimit = app.createRateLimit({
    max: 5,
    timeWindow: "1 minute",
    keyGenerator: (r) => JSON.stringify([r.ip, loginEmail(r)]),
  });
  const dummyPasswordHash = await argon2.hash(randomBytes(32).toString("hex"), {
    type: argon2.argon2id,
  });
  app.addHook("onReady", cleanupExpiredSessions);
  app.decorateRequest("actor", null);
  app.addHook("preHandler", async (r) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(r.method) &&
      r.headers["x-requested-with"] !== "BalochBuilder"
    )
      throw fail("Missing CSRF request header", 403);
    if (r.routeOptions.config.public || (r.method === "GET" && !r.url.startsWith("/api/"))) return;
    const token = r.cookies.session;
    if (token) {
      const { rows } = await pool.query(
        "SELECT u.id,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.last_seen_at>now()-interval '30 seconds' AND u.active",
        [hash(token)],
      );
      r.actor = rows[0] ?? null;
    }
    if (!r.actor) {
      throw fail("Authentication required", 401);
    }
    const permission = r.routeOptions.config.permission;
    if (permission && !can(r.actor.role, permission)) {
      await audit(r.actor.id, "permission_denied", r.routeOptions.url ?? r.url);
      throw fail("Permission denied", 403);
    }
  });
  app.setErrorHandler((error, _r, reply) => {
    const e = error as Error & { statusCode?: number; code?: string };
    if (e instanceof z.ZodError)
      return reply
        .code(400)
        .send({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    if (e.code?.startsWith("23") || e.code === "P0001")
      return reply.code(409).send({
        error:
          e.code === "P0001" ? e.message : "Record conflicts with existing data or constraints",
      });
    return reply
      .code(e.statusCode ?? 500)
      .send({ error: e.statusCode ? e.message : "Internal server error" });
  });
  app.get("/api/health", { config: { public: true } }, async () => ({ ok: true }));
  app.post(
    "/api/login",
    {
      config: { public: true, rateLimit: false },
      onRequest: async (r, reply) => {
        const result = await ipLoginLimit(r);
        if (!result.isAllowed && result.isExceeded) {
          reply.header("Retry-After", result.ttlInSeconds);
          throw fail("Too many login attempts. Please try again shortly.", 429);
        }
      },
      preValidation: async (r, reply) => {
        const result = await emailLoginLimit(r);
        if (!result.isAllowed && result.isExceeded) {
          reply.header("Retry-After", result.ttlInSeconds);
          throw fail("Too many login attempts. Please try again shortly.", 429);
        }
      },
    },
    async (r, reply) => {
      const data = z
        .object({
          username: z
            .string()
            .trim()
            .min(3)
            .max(64)
            .regex(/^[a-zA-Z0-9_.-]+$/)
            .optional(),
          email: z.string().trim().max(254).email().optional(),
          password: z.string().max(256),
          totp: z
            .string()
            .regex(/^\d{6}$/)
            .optional(),
        })
        .refine((d) => Boolean(d.username || d.email), "Username is required")
        .parse(r.body);
      await cleanupExpiredSessions();
      const user = (
        await pool.query(
          data.username
            ? "SELECT * FROM users WHERE username=$1"
            : "SELECT * FROM users WHERE email=$1 AND username IS NULL",
          [(data.username ?? data.email!).toLowerCase()],
        )
      ).rows[0];
      const passwordValid = await argon2.verify(
        user?.password_hash ?? dummyPasswordHash,
        data.password,
      );
      if (!user || !user.active || !passwordValid) {
        await audit(null, "login_failed", "auth", null, {
          username: (data.username ?? data.email!).toLowerCase().slice(0, 254),
        });
        throw fail("Invalid credentials", 401);
      }
      const token = randomBytes(32).toString("hex");
      await transaction(user.id, async (c) => {
        const fresh = (await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [user.id]))
          .rows[0];
        if (!fresh.active || fresh.password_hash !== user.password_hash)
          throw fail("Invalid credentials", 401);
        if (fresh.totp_secret) {
          const step = data.totp
            ? validTotp(fresh.totp_secret, data.totp, fresh.totp_last_step)
            : null;
          if (step === null) throw fail("A valid, unused two-factor code is required", 401);
          await c.query("UPDATE users SET totp_last_step=$1 WHERE id=$2", [step, user.id]);
        }
        await c.query(
          "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",
          [hash(token), user.id],
        );
      }).catch(async (e) => {
        await audit(user.id, "login_failed", "auth");
        throw e;
      });
      await audit(user.id, "login", "auth");
      reply.setCookie("session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 28800,
      });
      return { id: user.id, email: user.email, role: user.role };
    },
  );
  app.post("/api/logout", async (r, reply) => {
    await pool.query("DELETE FROM sessions WHERE token_hash=$1", [hash(r.cookies.session ?? "")]);
    await audit(actor(r).id, "logout", "auth");
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });
  app.post(
    "/api/change-password",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (r, reply) => {
      const data = z
        .object({ currentPassword: z.string().max(256), newPassword: z.string().min(12).max(256) })
        .strict()
        .parse(r.body);
      await transaction(actor(r).id, async (c) => {
        const user = (await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [actor(r).id]))
          .rows[0];
        if (!(await argon2.verify(user.password_hash, data.currentPassword)))
          throw fail("Current password is incorrect", 400);
        const passwordHash = await argon2.hash(data.newPassword, { type: argon2.argon2id });
        await c.query("UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2", [
          passwordHash,
          user.id,
        ]);
        await c.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
      });
      reply.clearCookie("session", { path: "/" });
      return { ok: true };
    },
  );
  app.post("/api/heartbeat", async (r) => {
    await pool.query(
      "UPDATE sessions SET last_seen_at=now() WHERE token_hash=$1 AND last_seen_at>now()-interval '30 seconds'",
      [hash(r.cookies.session ?? "")],
    );
    return { ok: true };
  });
  app.get("/api/me", async (r) => actor(r));
  app.post("/api/totp/enroll", { config: { permission: "ledger" } }, async (r) => {
    const { password } = z.object({ password: z.string() }).parse(r.body);
    const user = (await pool.query("SELECT * FROM users WHERE id=$1", [actor(r).id])).rows[0];
    if (!(await argon2.verify(user.password_hash, password)))
      throw fail("Invalid credentials", 401);
    if (user.totp_secret) throw fail("Two-factor already enabled");
    const t = new TOTP({
      issuer: "Baloch Builder",
      label: user.email,
      secret: new Secret({ size: 20 }),
    });
    await transaction(user.id, (c) =>
      c.query("UPDATE users SET totp_pending=$1 WHERE id=$2", [
        cryptSecret(t.secret.base32),
        user.id,
      ]),
    );
    return { secret: t.secret.base32, uri: t.toString() };
  });
  app.post("/api/totp/confirm", { config: { permission: "ledger" } }, async (r) => {
    const { token } = z.object({ token: z.string().regex(/^\d{6}$/) }).parse(r.body);
    await transaction(actor(r).id, async (c) => {
      const u = (await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [actor(r).id]))
        .rows[0];
      const step = u.totp_pending ? validTotp(u.totp_pending, token, null) : null;
      if (step === null) throw fail("Invalid code");
      await c.query(
        "UPDATE users SET totp_secret=totp_pending,totp_pending=null,totp_last_step=$1 WHERE id=$2",
        [step, u.id],
      );
    });
    await audit(actor(r).id, "totp_enabled", "auth");
    return { ok: true };
  });
  registerProjectRoutes(app);
  registerFunding(app);
  registerLand(app);
  const webRoot = fileURLToPath(new URL("../../dist/", import.meta.url));
  if (existsSync(webRoot)) await app.register(fastifyStatic, { root: webRoot, wildcard: false });
  return app;
}

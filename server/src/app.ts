import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import argon2 from "argon2";
import { createHash, randomBytes, randomUUID, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { TOTP, Secret } from "otpauth";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import {
  can,
  roleSchema,
  voucherSchema,
  dateSchema,
  settingsSchema,
  type Permission,
  type Role,
} from "@baloch/shared";
import { pool, db, transaction, audit } from "./db";
import { accounts } from "./schema";
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
const idParam = (r: FastifyRequest) => z.object({ id: z.string().uuid() }).parse(r.params).id;
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
export async function buildApp() {
  const app = Fastify({ logger: false, bodyLimit: 15 * 1024 * 1024 });
  await app.register(cookie);
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
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
        "SELECT u.id,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active",
        [hash(token)],
      );
      r.actor = rows[0] ?? null;
    }
    if (!r.actor) {
      await audit(null, "permission_denied", r.routeOptions.url ?? r.url);
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
    { config: { public: true, rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (r, reply) => {
      const data = z
        .object({
          email: z.string().email(),
          password: z.string().max(256),
          totp: z
            .string()
            .regex(/^\d{6}$/)
            .optional(),
        })
        .parse(r.body);
      const user = (
        await pool.query("SELECT * FROM users WHERE email=$1", [data.email.toLowerCase()])
      ).rows[0];
      if (!user || !user.active || !(await argon2.verify(user.password_hash, data.password))) {
        await audit(null, "login_failed", "auth", null, { email: data.email.toLowerCase() });
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
  app.get(
    "/api/users",
    { config: { permission: "users" } },
    async () =>
      (await pool.query("SELECT id,email,role,active,created_at FROM users ORDER BY email")).rows,
  );
  app.post("/api/users", { config: { permission: "users" } }, async (r) => {
    const d = z
      .object({
        email: z.string().email(),
        password: z.string().min(12).max(256),
        role: roleSchema,
      })
      .strict()
      .parse(r.body);
    const h = await argon2.hash(d.password, { type: argon2.argon2id });
    return transaction(
      actor(r).id,
      async (c) =>
        (
          await c.query(
            "INSERT INTO users(email,password_hash,role,created_by) VALUES($1,$2,$3,$4) RETURNING id,email,role,active",
            [d.email.toLowerCase(), h, d.role, actor(r).id],
          )
        ).rows[0],
    );
  });
  app.patch("/api/users/:id", { config: { permission: "users" } }, async (r) => {
    const id = idParam(r);
    const d = z.object({ role: roleSchema, active: z.boolean() }).strict().parse(r.body);
    return transaction(actor(r).id, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(782106)");
      if (
        (!d.active || d.role !== "admin") &&
        (await c.query("SELECT id FROM users WHERE role='admin' AND active AND id<>$1", [id]))
          .rowCount === 0
      )
        throw fail("Keep at least one active admin");
      const result = await c.query(
        "UPDATE users SET role=$1,active=$2,updated_at=now() WHERE id=$3 RETURNING id,email,role,active",
        [d.role, d.active, id],
      );
      if (!result.rowCount) throw fail("Not found", 404);
      await c.query("DELETE FROM sessions WHERE user_id=$1", [id]);
      return result.rows[0];
    });
  });
  app.get(
    "/api/projects",
    { config: { permission: "projects" } },
    async (r) =>
      (
        await pool.query(
          "SELECT p.* FROM projects p WHERE ($1<>'construction' OR EXISTS(SELECT 1 FROM project_assignments a WHERE a.project_id=p.id AND a.user_id=$2 AND a.active)) ORDER BY p.code",
          [actor(r).role, actor(r).id],
        )
      ).rows,
  );
  const projectInput = z
    .object({
      code: z.string().trim().min(1).max(40),
      name: z.string().trim().min(1).max(200),
      archived: z.boolean().default(false),
    })
    .strict();
  app.post("/api/projects", { config: { permission: "manageProjects" } }, async (r) => {
    const d = projectInput.parse(r.body);
    return transaction(
      actor(r).id,
      async (c) =>
        (
          await c.query(
            "INSERT INTO projects(code,name,archived,created_by) VALUES($1,$2,$3,$4) RETURNING *",
            [d.code, d.name, d.archived, actor(r).id],
          )
        ).rows[0],
    );
  });
  app.patch("/api/projects/:id", { config: { permission: "manageProjects" } }, async (r) => {
    const d = projectInput.parse(r.body);
    return transaction(
      actor(r).id,
      async (c) =>
        (
          await c.query(
            "UPDATE projects SET code=$1,name=$2,archived=$3,updated_at=now() WHERE id=$4 RETURNING *",
            [d.code, d.name, d.archived, idParam(r)],
          )
        ).rows[0] ?? Promise.reject(fail("Not found", 404)),
    );
  });
  app.get(
    "/api/assignments",
    { config: { permission: "users" } },
    async () => (await pool.query("SELECT * FROM project_assignments ORDER BY created_at")).rows,
  );
  app.post("/api/assignments", { config: { permission: "users" } }, async (r) => {
    const d = z
      .object({
        projectId: z.string().uuid(),
        userId: z.string().uuid(),
        active: z.boolean().default(true),
      })
      .strict()
      .parse(r.body);
    return transaction(
      actor(r).id,
      async (c) =>
        (
          await c.query(
            "INSERT INTO project_assignments(project_id,user_id,active,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(project_id,user_id) DO UPDATE SET active=excluded.active,updated_at=now() RETURNING *",
            [d.projectId, d.userId, d.active, actor(r).id],
          )
        ).rows[0],
    );
  });
  app.get("/api/accounts", { config: { permission: "accounts" } }, async () =>
    db.select().from(accounts).orderBy(asc(accounts.code)),
  );
  const accountInput = z
    .object({
      code: z.string().regex(/^\d{4,12}$/),
      name: z.string().min(1).max(200),
      type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
      normalBalance: z.enum(["debit", "credit"]),
      parentId: z.string().uuid().nullable().default(null),
      isCashBank: z.boolean().default(false),
    })
    .strict();
  app.post("/api/accounts", { config: { permission: "accounts" } }, async (r) => {
    const d = accountInput.parse(r.body);
    return transaction(
      actor(r).id,
      async (c) =>
        (
          await c.query(
            "INSERT INTO accounts(code,name,type,normal_balance,parent_id,is_cash_bank,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
            [d.code, d.name, d.type, d.normalBalance, d.parentId, d.isCashBank, actor(r).id],
          )
        ).rows[0],
    );
  });
  app.patch("/api/accounts/:id", { config: { permission: "accounts" } }, async (r) => {
    const d = z
      .object({ name: z.string().min(1).max(200), archived: z.boolean() })
      .strict()
      .parse(r.body);
    await transaction(actor(r).id, async (c) => {
      const out = await c.query("UPDATE accounts SET name=$1,archived=$2 WHERE id=$3", [
        d.name,
        d.archived,
        idParam(r),
      ]);
      if (!out.rowCount) throw fail("Not found", 404);
    });
    return (
      await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, idParam(r)))
    )[0];
  });
  app.get(
    "/api/periods",
    { config: { permission: "periods" } },
    async () =>
      (
        await pool.query(
          "SELECT id,to_char(month,'YYYY-MM-DD') AS month,locked FROM fiscal_periods ORDER BY month",
        )
      ).rows,
  );
  app.post("/api/periods", { config: { permission: "periods" } }, async (r) => {
    const d = z
      .object({ month: dateSchema, locked: z.boolean().default(false) })
      .strict()
      .parse(r.body);
    return transaction(
      actor(r).id,
      async (c) =>
        (
          await c.query(
            "INSERT INTO fiscal_periods(month,locked,created_by) VALUES($1,$2,$3) RETURNING *",
            [d.month, d.locked, actor(r).id],
          )
        ).rows[0],
    );
  });
  app.patch("/api/periods/:id", { config: { permission: "periods" } }, async (r) => {
    const d = z.object({ locked: z.boolean() }).strict().parse(r.body);
    return transaction(
      actor(r).id,
      async (c) =>
        (
          await c.query("UPDATE fiscal_periods SET locked=$1 WHERE id=$2 RETURNING *", [
            d.locked,
            idParam(r),
          ])
        ).rows[0] ?? Promise.reject(fail("Not found", 404)),
    );
  });
  app.get(
    "/api/settings",
    { config: { permission: "settings" } },
    async () => (await pool.query("SELECT value FROM settings")).rows[0]?.value,
  );
  app.put("/api/settings", { config: { permission: "settings" } }, async (r) => {
    const value = settingsSchema.parse(r.body);
    await transaction(actor(r).id, async (c) => {
      await c.query("SELECT accounting_lock()");
      const previous = (await c.query("SELECT value FROM settings FOR UPDATE")).rows[0]?.value;
      if (
        previous.fiscalYearStartMonth !== value.fiscalYearStartMonth &&
        (await c.query("SELECT 1 FROM vouchers WHERE status='posted' LIMIT 1")).rowCount
      )
        throw fail("Fiscal-year start cannot change after posting");
      await c.query("UPDATE settings SET value=$1,updated_at=now()", [value]);
    });
    return value;
  });
  app.get(
    "/api/vouchers",
    { config: { permission: "ledger" } },
    async () =>
      (
        await pool.query(
          "SELECT id,type,to_char(date,'YYYY-MM-DD') AS date,narration,status,number,reverses_id,correction_of_id,created_by FROM vouchers ORDER BY date DESC,created_at DESC",
        )
      ).rows,
  );
  app.get("/api/vouchers/:id", { config: { permission: "ledger" } }, async (r) => {
    const id = idParam(r);
    const v = (
      await pool.query("SELECT *,to_char(date,'YYYY-MM-DD') AS date FROM vouchers WHERE id=$1", [
        id,
      ])
    ).rows[0];
    if (!v) throw fail("Not found", 404);
    return {
      ...v,
      lines: (
        await pool.query(
          'SELECT id,account_id AS "accountId",project_id AS "projectId",debit::text,credit::text,narration,partner_id AS "partnerId",supplier_id AS "supplierId",buyer_id AS "buyerId",unit_id AS "unitId" FROM voucher_lines WHERE voucher_id=$1 AND NOT archived ORDER BY created_at,id',
          [id],
        )
      ).rows,
    };
  });
  const saveVoucher = async (r: FastifyRequest, update: boolean) => {
    const d = voucherSchema.parse(r.body);
    return transaction(actor(r).id, async (c) => {
      await c.query("SELECT accounting_lock()");
      let id: string;
      if (update) {
        id = idParam(r);
        const changed = await c.query(
          "UPDATE vouchers SET type=$1,date=$2,narration=$3 WHERE id=$4 RETURNING id",
          [d.type, d.date, d.narration, id],
        );
        if (!changed.rowCount) throw fail("Not found", 404);
        await c.query(
          "UPDATE voucher_lines SET archived=true WHERE voucher_id=$1 AND NOT archived",
          [id],
        );
      } else {
        id = (
          await c.query(
            "INSERT INTO vouchers(type,date,narration,created_by,correction_of_id) VALUES($1,$2,$3,$4,$5) RETURNING id",
            [d.type, d.date, d.narration, actor(r).id, d.correctionOfId ?? null],
          )
        ).rows[0].id;
      }
      for (const l of d.lines)
        await c.query(
          "INSERT INTO voucher_lines(voucher_id,account_id,project_id,debit,credit,narration,partner_id,supplier_id,buyer_id,unit_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
          [
            id,
            l.accountId,
            l.projectId,
            l.debit,
            l.credit,
            l.narration,
            l.partnerId,
            l.supplierId,
            l.buyerId,
            l.unitId,
            actor(r).id,
          ],
        );
      return { id };
    });
  };
  app.post("/api/vouchers", { config: { permission: "ledger" } }, async (r) =>
    saveVoucher(r, false),
  );
  app.put("/api/vouchers/:id", { config: { permission: "ledger" } }, async (r) =>
    saveVoucher(r, true),
  );
  app.post("/api/vouchers/:id/post", { config: { permission: "ledger" } }, async (r) =>
    transaction(actor(r).id, async (c) => {
      await c.query("SELECT accounting_lock()");
      const result = await c.query("UPDATE vouchers SET status='posted' WHERE id=$1 RETURNING *", [
        idParam(r),
      ]);
      if (!result.rowCount) throw fail("Not found", 404);
      return result.rows[0];
    }),
  );
  app.post("/api/vouchers/:id/reverse", { config: { permission: "ledger" } }, async (r) => {
    const d = z
      .object({ date: dateSchema, narration: z.string().min(1).max(1000) })
      .strict()
      .parse(r.body);
    return transaction(actor(r).id, async (c) => {
      await c.query("SELECT accounting_lock()");
      const original = (
        await c.query("SELECT * FROM vouchers WHERE id=$1 AND status='posted' FOR UPDATE", [
          idParam(r),
        ])
      ).rows[0];
      if (!original) throw fail("Posted voucher not found", 404);
      const v = (
        await c.query(
          "INSERT INTO vouchers(type,date,narration,reverses_id,created_by) VALUES('JV',$1,$2,$3,$4) RETURNING id",
          [d.date, d.narration, original.id, actor(r).id],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO voucher_lines(voucher_id,account_id,project_id,debit,credit,narration,partner_id,supplier_id,buyer_id,unit_id,created_by) SELECT $1,account_id,project_id,credit,debit,narration,partner_id,supplier_id,buyer_id,unit_id,$2 FROM voucher_lines WHERE voucher_id=$3 AND NOT archived",
        [v.id, actor(r).id, original.id],
      );
      return v;
    });
  });
  app.get("/api/journal", { config: { permission: "ledger" } }, async (r) => {
    const q = z
      .object({
        projectId: z.string().uuid().optional(),
        from: dateSchema.optional(),
        to: dateSchema.optional(),
      })
      .parse(r.query);
    return (
      await pool.query(
        "SELECT l.id,v.number,to_char(v.date,'YYYY-MM-DD') AS date,a.code,a.name,p.name AS project,l.debit::text,l.credit::text,l.narration FROM voucher_lines l JOIN vouchers v ON v.id=l.voucher_id JOIN accounts a ON a.id=l.account_id JOIN projects p ON p.id=l.project_id WHERE v.status='posted' AND NOT l.archived AND ($1::uuid IS NULL OR l.project_id=$1) AND ($2::date IS NULL OR v.date>=$2) AND ($3::date IS NULL OR v.date<=$3) ORDER BY v.date,v.number,a.code",
        [q.projectId, q.from, q.to],
      )
    ).rows;
  });
  app.get("/api/trial-balance", { config: { permission: "ledger" } }, async (r) => {
    const q = z
      .object({
        projectId: z.string().uuid().optional(),
        from: dateSchema.optional(),
        to: dateSchema.optional(),
      })
      .parse(r.query);
    return (
      await pool.query(
        "WITH balances AS (SELECT l.account_id,sum(l.debit) AS debit,sum(l.credit) AS credit FROM voucher_lines l JOIN vouchers v ON v.id=l.voucher_id WHERE v.status='posted' AND NOT l.archived AND ($1::uuid IS NULL OR l.project_id=$1) AND ($2::date IS NULL OR v.date>=$2) AND ($3::date IS NULL OR v.date<=$3) GROUP BY l.account_id) SELECT a.id,a.code,a.name,a.type,coalesce(b.debit,0)::text AS movement_debit,coalesce(b.credit,0)::text AS movement_credit,greatest(coalesce(b.debit,0)-coalesce(b.credit,0),0)::text AS debit,greatest(coalesce(b.credit,0)-coalesce(b.debit,0),0)::text AS credit FROM accounts a LEFT JOIN balances b ON a.id=b.account_id ORDER BY a.code",
        [q.projectId, q.from, q.to],
      )
    ).rows;
  });
  app.get(
    "/api/audit",
    { config: { permission: "audit" } },
    async () => (await pool.query("SELECT * FROM audit_log ORDER BY created_at DESC")).rows,
  );
  app.get("/api/views/:screen", async (r) => {
    const { screen } = z.object({ screen: z.string().max(80) }).parse(r.params);
    return (
      (
        await pool.query("SELECT value FROM saved_views WHERE user_id=$1 AND screen=$2", [
          actor(r).id,
          screen,
        ])
      ).rows[0]?.value ?? null
    );
  });
  app.put("/api/views/:screen", async (r) => {
    const { screen } = z.object({ screen: z.string().max(80) }).parse(r.params);
    const value = z
      .object({ columns: z.array(z.unknown()), filters: z.record(z.unknown()) })
      .parse(r.body);
    await transaction(actor(r).id, (c) =>
      c.query(
        "INSERT INTO saved_views(user_id,screen,value,created_by) VALUES($1,$2,$3,$1) ON CONFLICT(user_id,screen) DO UPDATE SET value=excluded.value,updated_at=now()",
        [actor(r).id, screen, value],
      ),
    );
    return { ok: true };
  });
  const attachmentRoot = path.resolve(process.env.ATTACHMENT_DIR ?? "./var/attachments");
  app.get(
    "/api/vouchers/:id/attachments",
    { config: { permission: "ledger" } },
    async (r) =>
      (
        await pool.query(
          "SELECT id,filename,content_type,size FROM attachments WHERE voucher_id=$1",
          [idParam(r)],
        )
      ).rows,
  );
  app.post("/api/vouchers/:id/attachments", { config: { permission: "ledger" } }, async (r) => {
    const d = z
      .object({
        filename: z.string().min(1).max(200),
        base64: z.string().max(14 * 1024 * 1024),
        contentType: z.enum(["application/pdf", "image/png", "image/jpeg", "text/plain"]),
      })
      .strict()
      .parse(r.body);
    const bytes = Buffer.from(d.base64, "base64");
    if (!bytes.length || bytes.length > 10 * 1024 * 1024)
      throw fail("File must be 1 byte to 10 MiB");
    const key = randomUUID();
    await mkdir(attachmentRoot, { recursive: true });
    await writeFile(path.join(attachmentRoot, key), bytes, { flag: "wx" });
    try {
      return await transaction(actor(r).id, async (c) => {
        await c.query("SELECT accounting_lock()");
        const v = (await c.query("SELECT * FROM vouchers WHERE id=$1 FOR UPDATE", [idParam(r)]))
          .rows[0];
        if (!v || v.status !== "draft") throw fail("Attachments require a draft");
        await c.query("SELECT open_period($1)", [v.date]);
        return (
          await c.query(
            "INSERT INTO attachments(voucher_id,filename,storage_key,content_type,size,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
            [v.id, d.filename, key, d.contentType, bytes.length, actor(r).id],
          )
        ).rows[0];
      });
    } catch (e) {
      await unlink(path.join(attachmentRoot, key));
      throw e;
    }
  });
  app.get("/api/attachments/:id", { config: { permission: "ledger" } }, async (r, reply) => {
    const a = (await pool.query("SELECT * FROM attachments WHERE id=$1", [idParam(r)])).rows[0];
    if (!a) throw fail("Not found", 404);
    reply
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
      )
      .header("X-Content-Type-Options", "nosniff")
      .type("application/octet-stream");
    return readFile(path.join(attachmentRoot, a.storage_key));
  });
  const webRoot = fileURLToPath(new URL("../../dist/", import.meta.url));
  if (existsSync(webRoot)) await app.register(fastifyStatic, { root: webRoot, wildcard: false });
  return app;
}

import { it, expect } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { buildApp } from "../src/app";
import { pool, transaction } from "../src/db";

export function registerSessionTests() {
  const expired = async () => {
    const user = (await pool.query("SELECT id FROM users WHERE email='accountant@example.test'"))
      .rows[0];
    const token = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(token).digest("hex");
    await pool.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()-interval '1 hour')",
      [hash, user.id],
    );
    return { token, hash };
  };
  it("cleans expired sessions at startup", async () => {
    const { hash } = await expired();
    const app = await buildApp();
    try {
      await app.ready();
      expect(
        (await pool.query("SELECT 1 FROM sessions WHERE token_hash=$1", [hash])).rowCount,
      ).toBe(0);
    } finally {
      await app.close();
    }
  });
  it("rejects expired sessions and cleans them on accepted login without deleting live sessions", async () => {
    const app = await buildApp();
    try {
      await app.ready();
      const { token, hash } = await expired();
      const live = Number(
        (await pool.query("SELECT count(*) FROM sessions WHERE expires_at>now()")).rows[0].count,
      );
      expect(
        (await app.inject({ url: "/api/accounts", headers: { cookie: `session=${token}` } }))
          .statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/login",
            headers: { "x-requested-with": "BalochBuilder" },
            payload: { email: "cleanup@example.test", password: "bad-password" },
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (await pool.query("SELECT 1 FROM sessions WHERE token_hash=$1", [hash])).rowCount,
      ).toBe(0);
      expect(
        Number(
          (await pool.query("SELECT count(*) FROM sessions WHERE expires_at>now()")).rows[0].count,
        ),
      ).toBe(live);
    } finally {
      await app.close();
    }
  });
  it("rejects a live session immediately when its user is deactivated", async () => {
    const app = await buildApp();
    const user = (await pool.query("SELECT id FROM users WHERE email='accountant@example.test'"))
      .rows[0];
    const token = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(token).digest("hex");
    try {
      await pool.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        [hash, user.id],
      );
      await transaction(user.id, (c) =>
        c.query("UPDATE users SET active=false WHERE id=$1", [user.id]),
      );
      expect(
        (await app.inject({ url: "/api/accounts", headers: { cookie: `session=${token}` } }))
          .statusCode,
      ).toBe(401);
    } finally {
      await transaction(null, (c) =>
        c.query("UPDATE users SET active=true WHERE id=$1", [user.id]),
      );
      await pool.query("DELETE FROM sessions WHERE token_hash=$1", [hash]);
      await app.close();
    }
  });
}

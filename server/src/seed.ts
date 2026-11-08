import argon2 from "argon2";
import { fileURLToPath } from "node:url";
import { pool, transaction } from "./db";

export async function seed(username: string, email: string, password: string) {
  username = username.trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,64}$/.test(username) || !email.includes("@") || password.length < 12)
    throw new Error("Set ADMIN_USERNAME, ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters)");
  return transaction(null, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(782106)");
    const existing = (await c.query("SELECT id FROM users WHERE username=$1", [username])).rows[0];
    if (existing) return existing.id as string;
    if ((await c.query("SELECT 1 FROM users LIMIT 1")).rowCount)
      throw new Error("An account already exists; use Settings to change its password");
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const user = (
      await c.query(
        "INSERT INTO users(username,email,password_hash,role) VALUES($1,$2,$3,'admin') RETURNING id",
        [username, email.toLowerCase(), hash],
      )
    ).rows[0];
    await c.query("SELECT set_config('app.actor_id',$1,true)", [user.id]);
    await c.query("UPDATE users SET created_by=id WHERE id=$1", [user.id]);
    return user.id as string;
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await seed(
      process.env.ADMIN_USERNAME ?? "admin",
      process.env.ADMIN_EMAIL ?? "",
      process.env.ADMIN_PASSWORD ?? "",
    );
    console.log("Login account ready");
  } finally {
    await pool.end();
  }
}

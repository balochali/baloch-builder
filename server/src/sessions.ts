import { pool } from "./db";
export async function cleanupExpiredSessions() {
  await pool.query("DELETE FROM sessions WHERE expires_at <= now()");
}

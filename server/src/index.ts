import { buildApp } from "./app";
import { pool, assertRuntimeRole } from "./db";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const app = await buildApp();
await assertRuntimeRole();
await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });

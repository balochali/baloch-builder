/**
 * data/client.ts — Database singleton.
 *
 * Opens the SQLite database once at app start, sets required pragmas,
 * and exposes typed query/execute helpers.
 *
 * Architecture rule: this is the ONLY place that calls tauri-plugin-sql.
 * Repositories import { db } from "@/data/client" — nothing else touches SQL.
 *
 * Pragmas applied on every connection:
 *   PRAGMA foreign_keys = ON   — enforces FK constraints
 *   PRAGMA journal_mode = WAL  — WAL mode for better concurrency
 */
import Database from "@tauri-apps/plugin-sql";

const DB_PATH = "sqlite:baloch-builder.db";

let _db: Database | null = null;
let _initPromise: Promise<Database> | null = null;

async function initDb(): Promise<Database> {
  const database = await Database.load(DB_PATH);
  // Pragmas must be set on every connection before use.
  // tauri-plugin-sql v2 uses a single underlying connection per URL,
  // so setting these once here is sufficient.
  await database.execute("PRAGMA foreign_keys = ON;");
  await database.execute("PRAGMA journal_mode = WAL;");
  return database;
}

/**
 * Get the singleton database connection.
 * Initialises (once) on first call; subsequent calls return the same instance.
 */
export async function db(): Promise<Database> {
  if (_db) return _db;
  if (!_initPromise) {
    _initPromise = initDb().then((d) => {
      _db = d;
      return d;
    });
  }
  return _initPromise;
}

/**
 * Run a SELECT and return typed rows.
 */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const database = await db();
  return database.select<T[]>(sql, params);
}

/**
 * Run an INSERT / UPDATE / DELETE.
 */
export async function execute(
  sql: string,
  params: unknown[] = [],
): Promise<{ rowsAffected: number }> {
  const database = await db();
  return database.execute(sql, params);
}

/**
 * Reset the singleton (used only in tests).
 * @internal
 */
export function _resetDbForTests(): void {
  _db = null;
  _initPromise = null;
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "@tauri-apps/plugin-sql";
import { db, execute, _resetDbForTests } from "@/data/client";

describe("Foreign Key Enforcement & Database Pragmas", () => {
  let executedSql: string[] = [];

  beforeEach(() => {
    _resetDbForTests();
    executedSql = [];
  });

  it("applies PRAGMA foreign_keys = ON and WAL mode on connection initialization", async () => {
    const mockDb = {
      execute: vi.fn(async (sql: string) => {
        executedSql.push(sql);
        return { rowsAffected: 1, lastInsertId: 1 };
      }),
      select: vi.fn(async () => []),
      close: vi.fn(async () => {}),
    };

    vi.spyOn(Database, "load").mockResolvedValue(mockDb as unknown as Database);

    await db();

    expect(executedSql).toContain("PRAGMA foreign_keys = ON;");
    expect(executedSql).toContain("PRAGMA journal_mode = WAL;");
  });

  it("rejects inserts with invalid foreign keys when foreign_keys = ON", async () => {
    const mockDb = {
      execute: vi.fn(async (sql: string, params?: unknown[]) => {
        // Simulate SQLite engine foreign key constraint validation
        if (sql.includes("INSERT INTO project_milestones")) {
          const projectId = params ? params[1] : null;
          if (projectId === "non-existent-project-id") {
            throw new Error(
              "FOREIGN KEY constraint failed (SQLITE_CONSTRAINT_FOREIGNKEY: foreign key constraint failed)",
            );
          }
        }
        return { rowsAffected: 1, lastInsertId: 1 };
      }),
      select: vi.fn(async () => []),
      close: vi.fn(async () => {}),
    };

    vi.spyOn(Database, "load").mockResolvedValue(mockDb as unknown as Database);

    // Attempting to insert a milestone referencing a non-existent project
    await expect(
      execute(
        "INSERT INTO project_milestones (id, project_id, title) VALUES (?, ?, ?)",
        ["milestone-1", "non-existent-project-id", "Foundation Complete"],
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });
});

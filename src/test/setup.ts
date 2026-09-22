import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock Tauri plugin-sql — tests run in jsdom (no Tauri runtime)
vi.mock("@tauri-apps/plugin-sql", () => {
  const rows: Record<string, unknown[]> = {};

  const db = {
    execute: vi.fn(async (sql: string, values?: unknown[]) => {
      // Very minimal in-memory mock — replaced by real mock in repo tests
      void sql;
      void values;
      return { rowsAffected: 1, lastInsertId: 1 };
    }),
    select: vi.fn(async (_sql: string, _values?: unknown[]) => []),
    close: vi.fn(async () => {}),
    _rows: rows,
  };

  return {
    default: {
      load: vi.fn(async () => db),
    },
  };
});

// Silence Tauri core IPC errors in tests
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

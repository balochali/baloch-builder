import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "@/data/client";
import { getProjectLand, saveProjectStage } from "@/data/repositories/projectStageRepository";
import type Database from "@tauri-apps/plugin-sql";

const projectId = "11111111-1111-4111-8111-111111111111";
const land = {
  account_key: "builder" as const,
  title: "Residency plot",
  location: "Karachi",
  purchase_date: "2026-09-27",
  area_value: 7000,
  area_unit: "sqyd" as const,
  seller_name: "Ali",
  price: 5_000_000,
  notes: "",
  payment_details: {
    method: "bank" as const,
    paid_to: "Ali",
    provider: "Meezan Bank",
    account_name: "Baloch Builders",
    account_no: "1234",
    reference: "TRX-42",
    cheque_date: "",
  },
};

describe("project stage records", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads land details saved for a project", async () => {
    vi.spyOn(client, "query").mockResolvedValue([
      { id: "land-1", ...land, custom: '{"seller_name":"Ali"}' },
    ]);
    expect(await getProjectLand(projectId)).toEqual(
      expect.objectContaining({ seller_name: "Ali", area_value: 7000 }),
    );
  });

  it("saves land and status in one transaction", async () => {
    const execute = vi.fn().mockResolvedValue({ rowsAffected: 1 });
    const select = vi
      .fn()
      .mockResolvedValueOnce([{ id: projectId }])
      .mockResolvedValueOnce([]);
    vi.spyOn(client, "db").mockResolvedValue({ execute, select } as unknown as Database);
    vi.spyOn(client, "query").mockResolvedValue([{ id: projectId, status: "land acquired" }]);
    await saveProjectStage(projectId, "land acquired", land);
    expect(execute).toHaveBeenCalledWith("BEGIN IMMEDIATE");
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO land"),
      expect.arrayContaining(["Residency plot", "Karachi", 7000, "sqyd", 5_000_000, projectId]),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO land"),
      expect.arrayContaining([expect.stringContaining('"reference":"TRX-42"')]),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE projects SET status"),
      expect.arrayContaining(["land acquired", projectId]),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE project_building_details SET plot_area_value"),
      [7000, "sqyd", expect.any(String), projectId],
    );
    expect(execute).toHaveBeenCalledWith("COMMIT");
  });

  it("updates the existing project land as the final land record", async () => {
    const execute = vi.fn().mockResolvedValue({ rowsAffected: 1 });
    const select = vi
      .fn()
      .mockResolvedValueOnce([{ id: projectId }])
      .mockResolvedValueOnce([{ id: "original-land" }]);
    vi.spyOn(client, "db").mockResolvedValue({ execute, select } as unknown as Database);
    vi.spyOn(client, "query").mockResolvedValue([{ id: projectId, status: "land acquired" }]);
    await saveProjectStage(projectId, "land acquired", {
      ...land,
      location: "Final plot, Karachi",
    });
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE land SET title"),
      expect.arrayContaining(["Final plot, Karachi", "original-land"]),
    );
    expect(execute).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO land"),
      expect.anything(),
    );
  });

  it("rolls back land and status when the land record cannot save", async () => {
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO land")) throw new Error("disk error");
      return { rowsAffected: 1 };
    });
    const select = vi
      .fn()
      .mockResolvedValueOnce([{ id: projectId }])
      .mockResolvedValueOnce([]);
    vi.spyOn(client, "db").mockResolvedValue({ execute, select } as unknown as Database);
    await expect(saveProjectStage(projectId, "land acquired", land)).rejects.toThrow("disk error");
    expect(execute).toHaveBeenCalledWith("ROLLBACK");
    expect(execute).not.toHaveBeenCalledWith("COMMIT");
    expect(execute).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE projects SET status"),
      expect.anything(),
    );
  });
});

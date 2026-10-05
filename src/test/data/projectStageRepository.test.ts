import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import * as client from "@/data/client";
import { getProjectLand, saveProjectStage } from "@/data/repositories/projectStageRepository";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

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
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(invoke).mockReset();
  });

  it("loads land details saved for a project", async () => {
    vi.spyOn(client, "query").mockResolvedValue([
      { id: "land-1", ...land, custom: '{"seller_name":"Ali"}' },
    ]);
    expect(await getProjectLand(projectId)).toEqual(
      expect.objectContaining({ seller_name: "Ali", area_value: 7000 }),
    );
  });

  it("sends land and status to one native transaction", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    vi.spyOn(client, "query").mockResolvedValue([{ id: projectId, status: "land acquired" }]);
    await saveProjectStage(projectId, "land acquired", land);
    expect(invoke).toHaveBeenCalledWith("save_project_stage", expect.objectContaining({
      projectId,
      status: "land acquired",
      land: expect.objectContaining({
        title: "Residency plot",
        account_key: "builder",
        payment_details: expect.objectContaining({ reference: "TRX-42" }),
      }),
      landId: expect.any(String),
      timestamp: expect.any(String),
    }));
  });

  it("preserves the original database failure", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("disk error"));
    await expect(saveProjectStage(projectId, "land acquired", land)).rejects.toThrow("disk error");
  });
});

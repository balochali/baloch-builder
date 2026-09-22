import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "@/data/client";
import { addActualProjectCost, addProjectEstimate, archiveProjectEstimate, updateProjectEstimate, EstimateInputSchema,
  listActualProjectCosts } from "@/data/repositories/projectFinanceRepository";
import type { ProjectEstimate, Transaction } from "@/domain/types";

const projectId = "11111111-1111-4111-8111-111111111111";

describe("project finance persistence", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("rejects an estimate whose maximum is below its minimum", () => {
    expect(EstimateInputSchema.safeParse({ project_id: projectId, kind: "cost", title: "Cement",
      details: "", minimum_amount: 100_000, maximum_amount: 90_000 }).success).toBe(false);
  });

  it("writes an estimate line with its project and amounts", async () => {
    const execute = vi.spyOn(client, "execute").mockResolvedValue({ rowsAffected: 1 });
    vi.spyOn(client, "query").mockResolvedValue([{ id: "estimate-1", project_id: projectId,
      kind: "cost", title: "Cement", details: null, minimum_amount: 100_000,
      maximum_amount: 150_000 }] as ProjectEstimate[]);
    const row = await addProjectEstimate({ project_id: projectId, kind: "cost", title: "Cement",
      details: "", minimum_amount: 100_000, maximum_amount: 150_000 });
    expect(row.title).toBe("Cement");
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO project_estimates"),
      expect.arrayContaining([projectId, "cost", "Cement", 100_000, 150_000]));
  });

  it("records actual cost as an outgoing project ledger transaction", async () => {
    const execute = vi.spyOn(client, "execute").mockResolvedValue({ rowsAffected: 1 });
    vi.spyOn(client, "query").mockResolvedValue([{ id: "transaction-1", project_id: projectId,
      date: "2026-09-22", amount: 50_000, direction: "out", type: "project_cost",
      method: "cash", description: "Cement payment" }] as Transaction[]);
    const row = await addActualProjectCost({ project_id: projectId, date: "2026-09-22",
      amount: 50_000, description: "Cement payment", method: "cash", reference: "" });
    expect(row.amount).toBe(50_000);
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("'out', 'project_cost'"),
      expect.arrayContaining([projectId, 50_000, "Cement payment"]));
  });

  it("shows only active project cost transactions in the actual tab", async () => {
    const query = vi.spyOn(client, "query").mockResolvedValue([]);
    await listActualProjectCosts(projectId);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("type = 'project_cost'"), [projectId]);
    expect(query.mock.calls[0][0]).toContain("archived = 0");
  });

  it("archives only an estimate belonging to the selected project", async () => {
    const execute = vi.spyOn(client, "execute").mockResolvedValue({ rowsAffected: 1 });
    await archiveProjectEstimate(projectId, "estimate-1");
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = ? AND project_id = ? AND archived = 0"),
      expect.arrayContaining(["estimate-1", projectId]),
    );
  });

  it("updates the existing project estimate without creating a second item", async () => {
    const execute = vi.spyOn(client, "execute").mockResolvedValue({ rowsAffected: 1 });
    const query = vi.spyOn(client, "query").mockResolvedValue([{
      id: "estimate-1", project_id: projectId, kind: "revenue", title: "Shop sales",
      details: "Two shops", minimum_amount: 500_000, maximum_amount: 700_000,
    }] as ProjectEstimate[]);
    const item = await updateProjectEstimate("estimate-1", {
      project_id: projectId, kind: "revenue", title: "Shop sales", details: "Two shops",
      minimum_amount: 500_000, maximum_amount: 700_000,
    });
    expect(item.id).toBe("estimate-1");
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("WHERE id = ? AND project_id = ? AND archived = 0"),
      expect.arrayContaining(["estimate-1", projectId]));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE id = ? AND project_id = ?"),
      ["estimate-1", projectId]);
  });

  it("reports when the estimate to archive is missing", async () => {
    vi.spyOn(client, "execute").mockResolvedValue({ rowsAffected: 0 });
    await expect(archiveProjectEstimate(projectId, "missing")).rejects.toThrow("not found");
  });
});

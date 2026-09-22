import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "@/data/client";
import { createProject, listProjects } from "@/data/repositories/projectsRepository";
import type { Project } from "@/domain/types";

describe("projectsRepository", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("saves required details and returns the persisted project", async () => {
    const execute = vi.spyOn(client, "execute").mockResolvedValue({ rowsAffected: 1 });
    const query = vi.spyOn(client, "query").mockImplementation(async (_sql, params) => [{
      id: params?.[0], name: "Baloch Residency", location: "Quetta",
      code: null, description: null, status: "planning", start_date: null,
      created_at: "2026-09-22T00:00:00.000Z", updated_at: "2026-09-22T00:00:00.000Z",
      archived: 0, custom: "{}",
    }] as Project[]);

    const project = await createProject({
      name: "  Baloch Residency  ", location: " Quetta ", code: "",
      description: "", status: "planning", start_date: "",
    });

    expect(project.name).toBe("Baloch Residency");
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO projects"),
      expect.arrayContaining(["Baloch Residency", "Quetta", "planning"]));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE id = ?"), [project.id]);
  });

  it("rejects blank name and address before writing", async () => {
    const execute = vi.spyOn(client, "execute");
    await expect(createProject({
      name: " ", location: " ", code: "", description: "", status: "planning", start_date: "",
    })).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  it("lists only active projects", async () => {
    const query = vi.spyOn(client, "query").mockResolvedValue([]);
    await listProjects();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE archived = 0"));
  });
});

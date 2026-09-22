import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "@/data/client";
import { BuildingDetailsSchema, saveProjectBuildingDetails } from "@/data/repositories/projectBuildingRepository";
import type { ProjectBuildingDetails } from "@/domain/types";

const projectId = "11111111-1111-4111-8111-111111111111";

const details = {
  project_id: projectId, building_use: "mixed-use" as const,
  spaces: ["flats", "shops", "parking", "masjid"] as ("flats" | "shops" | "parking" | "masjid")[],
  floors_above_ground: 2, basement_count: 1,
  floor_layout: [
    { floor_index: 0, flat_types: [] },
    { floor_index: 1, flat_types: [{ rooms: 2, count: 3 }, { rooms: 3, count: 2 }] },
  ],
  planned_shops: 3, planned_offices: 0,
  parking_area_value: 1200, parking_area_unit: "sqft" as const,
  planned_houses: null,
  plot_area_value: 10, plot_area_unit: "marla" as const,
  covered_area_sqft: 18_000, notes: "Ground floor shops",
};

describe("project building details", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requires a plot area and unit together", () => {
    expect(BuildingDetailsSchema.safeParse({ ...details, plot_area_unit: null }).success).toBe(false);
  });

  it("requires a measured parking area and unit when parking is selected", () => {
    expect(BuildingDetailsSchema.safeParse({ ...details, parking_area_unit: null }).success).toBe(false);
    expect(BuildingDetailsSchema.safeParse({ ...details, parking_area_value: null }).success).toBe(false);
    expect(BuildingDetailsSchema.safeParse({ ...details, parking_area_unit: "sqyd" }).success).toBe(true);
  });

  it("requires a floor-by-floor flat plan when flats are selected", () => {
    expect(BuildingDetailsSchema.safeParse({ ...details, floor_layout: [] }).success).toBe(false);
  });

  it("saves planned counts and areas for one project", async () => {
    const execute = vi.spyOn(client, "execute").mockResolvedValue({ rowsAffected: 1 });
    vi.spyOn(client, "query").mockResolvedValue([{
      id: "building-1", ...details, planned_flats: 5, planned_parking_spaces: null, has_masjid: 1,
      selected_spaces_json: JSON.stringify(details.spaces), floor_layout_json: JSON.stringify(details.floor_layout),
      created_at: "2026-09-22", updated_at: "2026-09-22",
      archived: 0, custom: "{}",
    }] as ProjectBuildingDetails[]);

    const saved = await saveProjectBuildingDetails(details);
    expect(saved.planned_shops).toBe(3);
    expect(saved.planned_flats).toBe(5);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT(project_id) DO UPDATE"),
      expect.arrayContaining([projectId, "mixed-use", 2, 5, 3, 10, "marla", 1200, "sqft"]),
    );
  });
});

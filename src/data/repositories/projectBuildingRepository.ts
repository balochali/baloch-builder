import { z } from "zod";
import { execute, query } from "@/data/client";
import { newId, now } from "@/data/ids";
import type { ProjectBuildingDetails } from "@/domain/types";

const count = z.number().int().min(0).max(1_000_000).nullable();
const area = z.number().positive().max(1_000_000_000).nullable();
const SpaceSchema = z.enum([
  "flats", "shops", "offices", "houses", "parking", "masjid",
  "lift", "generator", "rooftop", "water_tank", "fire_safety",
]);
const FlatTypeSchema = z.object({
  rooms: z.number().int().min(1).max(20),
  count: z.number().int().min(1).max(1_000),
});
const FloorLayoutSchema = z.object({
  floor_index: z.number().int().min(0).max(49),
  flat_types: z.array(FlatTypeSchema).max(20),
});

export type BuildingSpace = z.infer<typeof SpaceSchema>;
export type FloorLayout = z.infer<typeof FloorLayoutSchema>;

export const BuildingDetailsSchema = z.object({
  project_id: z.string().uuid(),
  building_use: z.enum(["residential", "commercial", "mixed-use"]),
  spaces: z.array(SpaceSchema).min(1, "Select at least one space type"),
  floors_above_ground: z.number().int().min(1).max(50),
  basement_count: z.number().int().min(0).max(100).nullable(),
  floor_layout: z.array(FloorLayoutSchema).max(50),
  planned_shops: count,
  planned_offices: count,
  planned_houses: count,
  planned_parking_spaces: count,
  plot_area_value: area,
  plot_area_unit: z.enum(["marla", "kanal", "sqft", "sqyd", "acre"]).nullable(),
  covered_area_sqft: area,
  notes: z.string().trim().max(2000),
}).superRefine((value, ctx) => {
  if ((value.plot_area_value === null) !== (value.plot_area_unit === null)) {
    ctx.addIssue({ code: "custom", path: ["plot_area_value"], message: "Enter both the plot area and its unit" });
  }
  if (new Set(value.spaces).size !== value.spaces.length) {
    ctx.addIssue({ code: "custom", path: ["spaces"], message: "Select each space type only once" });
  }
  if (!["flats", "shops", "offices", "houses"].some((space) => value.spaces.includes(space as BuildingSpace))) {
    ctx.addIssue({ code: "custom", path: ["spaces"], message: "Select at least one flat, shop, office or house type" });
  }
  if (value.spaces.includes("flats")) {
    if (value.floor_layout.length !== value.floors_above_ground ||
        value.floor_layout.some((floor, index) => floor.floor_index !== index)) {
      ctx.addIssue({ code: "custom", path: ["floor_layout"], message: "Enter a flat plan for every floor" });
    }
    const totalFlats = value.floor_layout.reduce((total, floor) =>
      total + floor.flat_types.reduce((floorTotal, type) => floorTotal + type.count, 0), 0);
    if (totalFlats === 0) {
      ctx.addIssue({ code: "custom", path: ["floor_layout"], message: "Add at least one flat type and count" });
    }
    if (value.floor_layout.some((floor) => new Set(floor.flat_types.map((type) => type.rooms)).size !== floor.flat_types.length)) {
      ctx.addIssue({ code: "custom", path: ["floor_layout"], message: "Combine flats with the same room count on each floor" });
    }
  } else if (value.floor_layout.length > 0) {
    ctx.addIssue({ code: "custom", path: ["floor_layout"], message: "Flat layout requires Flats to be selected" });
  }
});

export type BuildingDetailsInput = z.infer<typeof BuildingDetailsSchema>;

export function decodeBuildingSpaces(raw: string): BuildingSpace[] {
  try {
    const parsed = z.array(SpaceSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch { return []; }
}

export function decodeFloorLayout(raw: string): FloorLayout[] {
  try {
    const parsed = z.array(FloorLayoutSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch { return []; }
}

export async function getProjectBuildingDetails(projectId: string): Promise<ProjectBuildingDetails | null> {
  const rows = await query<ProjectBuildingDetails>(
    `SELECT * FROM project_building_details WHERE project_id = ? AND archived = 0`,
    [projectId],
  );
  return rows[0] ?? null;
}

export async function saveProjectBuildingDetails(input: BuildingDetailsInput): Promise<ProjectBuildingDetails> {
  const value = BuildingDetailsSchema.parse(input);
  const timestamp = now();
  const plannedFlats = value.floor_layout.reduce((total, floor) =>
    total + floor.flat_types.reduce((floorTotal, type) => floorTotal + type.count, 0), 0);
  await execute(
    `INSERT INTO project_building_details
      (id, project_id, building_use, floors_above_ground, basement_count, planned_flats,
       planned_shops, planned_offices, planned_parking_spaces, plot_area_value, plot_area_unit,
       covered_area_sqft, notes, created_at, updated_at, planned_houses, has_masjid,
       selected_spaces_json, floor_layout_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET
       building_use = excluded.building_use,
       floors_above_ground = excluded.floors_above_ground,
       basement_count = excluded.basement_count,
       planned_flats = excluded.planned_flats,
       planned_shops = excluded.planned_shops,
       planned_offices = excluded.planned_offices,
       planned_parking_spaces = excluded.planned_parking_spaces,
       plot_area_value = excluded.plot_area_value,
       plot_area_unit = excluded.plot_area_unit,
       covered_area_sqft = excluded.covered_area_sqft,
       notes = excluded.notes,
       planned_houses = excluded.planned_houses,
       has_masjid = excluded.has_masjid,
       selected_spaces_json = excluded.selected_spaces_json,
       floor_layout_json = excluded.floor_layout_json,
       updated_at = excluded.updated_at`,
    [newId(), value.project_id, value.building_use, value.floors_above_ground,
      value.basement_count, plannedFlats, value.spaces.includes("shops") ? value.planned_shops : null,
      value.spaces.includes("offices") ? value.planned_offices : null,
      value.spaces.includes("parking") ? value.planned_parking_spaces : null,
      value.plot_area_value, value.plot_area_unit, value.covered_area_sqft, value.notes || null,
      timestamp, timestamp, value.spaces.includes("houses") ? value.planned_houses : null,
      value.spaces.includes("masjid") ? 1 : 0, JSON.stringify(value.spaces),
      JSON.stringify(value.floor_layout)],
  );
  const details = await getProjectBuildingDetails(value.project_id);
  if (!details) throw new Error("Building details were saved but could not be loaded");
  return details;
}

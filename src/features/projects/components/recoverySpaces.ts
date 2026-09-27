import type { ProjectBuildingDetails, ProjectEstimate } from "@/domain/types";
import { decodeFloorLayout } from "@/data/repositories/projectBuildingRepository";

export type RecoverySpace = "flats" | "shops" | "offices" | "houses";

export const recoveryLabels: Record<RecoverySpace, string> = {
  flats: "Flats", shops: "Shops", offices: "Offices", houses: "Houses",
};

export interface FlatRecoveryLine {
  floor_index: number;
  rooms: number;
  quantity: number;
  minimum_unit_price: number;
  maximum_unit_price: number;
}

export function plannedFlatGroups(details: ProjectBuildingDetails | null) {
  return decodeFloorLayout(details?.floor_layout_json ?? "[]").flatMap((floor) =>
    floor.flat_types.map((type) => ({ floor_index: floor.floor_index, rooms: type.rooms, count: type.count })));
}

export function flatRecoveryLines(estimate: ProjectEstimate): FlatRecoveryLine[] {
  try {
    const data = JSON.parse(estimate.custom || "{}");
    if (!Array.isArray(data.flat_recovery_lines)) return [];
    return data.flat_recovery_lines.filter((line: FlatRecoveryLine) =>
      Number.isInteger(line.floor_index) && Number.isInteger(line.rooms) && Number.isInteger(line.quantity) &&
      Number.isSafeInteger(line.minimum_unit_price) && Number.isSafeInteger(line.maximum_unit_price));
  } catch { return []; }
}

export function recoveryInventory(details: ProjectBuildingDetails | null): { space: RecoverySpace; count: number }[] {
  if (!details) return [];
  return ([
    { space: "flats", count: details.planned_flats },
    { space: "shops", count: details.planned_shops },
    { space: "offices", count: details.planned_offices },
    { space: "houses", count: details.planned_houses },
  ] as const).filter((item): item is { space: RecoverySpace; count: number } => item.count !== null && item.count > 0);
}

export function recoveryLink(estimate: ProjectEstimate): { space: RecoverySpace; quantity: number } | null {
  try {
    const data = JSON.parse(estimate.custom || "{}");
    if (!(data.recovery_space in recoveryLabels) || !Number.isInteger(data.recovery_quantity) || data.recovery_quantity < 1) return null;
    return { space: data.recovery_space, quantity: data.recovery_quantity };
  } catch { return null; }
}

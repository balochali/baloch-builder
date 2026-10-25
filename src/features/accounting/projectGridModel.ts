import {
  areaFromSqft,
  areaToSqft,
  projectFields,
  projectCreateSchema,
  type AreaSettings,
  type Role,
} from "@baloch/shared";
import type { Row } from "./Grid";
export const profileLabels: Record<string, string> = {
  code: "Code",
  name: "Name",
  type: "Type",
  city: "City",
  area_name: "Area name",
  address: "Address",
  start_date: "Start date",
  planned_end_date: "Planned end date",
  land_area_sqft: "Land area",
  covered_area_sqft: "Covered area",
  saleable_area_sqft: "Saleable area",
  project_manager_id: "Project manager",
  cost_allocation_method: "Cost allocation method",
  revenue_recognition: "Revenue recognition",
  notes: "Notes",
};
export const areaFields = ["land_area_sqft", "covered_area_sqft", "saleable_area_sqft"];
export const newProjectRow = (): Row => ({
  code: "",
  name: "",
  type: "apartments",
  city: "",
  status: "planning",
  start_date: "",
  planned_end_date: "",
  saleable_area_sqft: "",
  project_manager_id: "",
});
export function canEditProfile(role: Role, field: string) {
  return (
    role === "admin" ||
    (role === "accountant" && ["cost_allocation_method", "revenue_recognition"].includes(field))
  );
}
export function displayProjectValue(row: Row, field: string, settings: AreaSettings) {
  const v = row[field];
  if (v == null) return "";
  if (areaFields.includes(field))
    return areaFromSqft(String(v), settings.areaDisplayUnit, settings.marlaSqft);
  if (field === "project_manager_id") return row.project_manager_name ?? v;
  return String(v);
}
export function projectValue(
  field: string,
  value: unknown,
  settings: AreaSettings,
  users: Row[] = [],
) {
  const text = String(value ?? "").trim();
  if (areaFields.includes(field))
    return text ? areaToSqft(text, settings.areaDisplayUnit, settings.marlaSqft) : null;
  if (field === "project_manager_id") {
    if (!text) return null;
    const u = users.find((u) => u.id === text || u.email === text);
    if (!u) throw Error("Choose an active project manager");
    return u.id;
  }
  if (["start_date", "planned_end_date", "area_name", "address", "notes"].includes(field))
    return text || null;
  return text;
}
export function validateNewProject(row: Row, settings: AreaSettings, users: Row[]) {
  const body = Object.fromEntries(
    Object.keys(projectFields.shape)
      .filter((k) => k in row)
      .map((k) => [k, projectValue(k, row[k], settings, users)]),
  );
  return projectCreateSchema.parse(body);
}

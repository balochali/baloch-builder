/**
 * domain/types.ts — Shared TypeScript types for Baloch Builder.
 * Pure TypeScript only. No React, no DB, no Tauri imports.
 */

/** Common columns present on every data table */
export interface BaseRecord {
  id: string;
  created_at: string;
  updated_at: string;
  archived: 0 | 1;
  custom: string; // JSON string, default '{}'
}

export interface Contact extends BaseRecord {
  name: string;
  phone: string | null;
  phone2: string | null;
  address: string | null;
  notes: string | null;
}

export interface Project extends BaseRecord {
  code: string | null;
  name: string;
  location: string | null;
  description: string | null;
  status: string | null;
  start_date: string | null;
}

export interface ProjectEstimate extends BaseRecord {
  project_id: string;
  kind: "cost" | "revenue";
  title: string;
  details: string | null;
  minimum_amount: number;
  maximum_amount: number;
}

export interface ProjectBuildingDetails extends BaseRecord {
  project_id: string;
  building_use: "residential" | "commercial" | "mixed-use" | null;
  floors_above_ground: number | null;
  basement_count: number | null;
  planned_flats: number | null;
  planned_shops: number | null;
  planned_offices: number | null;
  planned_houses: number | null;
  planned_parking_spaces: number | null;
  has_masjid: 0 | 1;
  selected_spaces_json: string;
  floor_layout_json: string;
  plot_area_value: number | null;
  plot_area_unit: AreaUnit | null;
  covered_area_sqft: number | null;
  notes: string | null;
}

export interface ProjectMilestone extends BaseRecord {
  project_id: string;
  title: string | null;
  due_date: string | null;
  done: 0 | 1;
}

export type AreaUnit = "marla" | "kanal" | "sqft" | "sqyd" | "acre";

export interface Land extends BaseRecord {
  title: string;
  location: string | null;
  area_value: number | null;
  area_unit: AreaUnit | null;
  seller_contact_id: string | null;
  purchase_date: string | null;
  /** Integer rupees — no floats */
  price: number | null;
  status: string | null;
  project_id: string | null;
  is_personal: 0 | 1;
  notes: string | null;
}

export interface Partner extends BaseRecord {
  contact_id: string;
  status: string | null;
  notes: string | null;
}

export interface Partnership extends BaseRecord {
  project_id: string;
  partner_id: string;
  /** Basis points: 2500 = 25.00% */
  share_bp: number;
  /** Integer rupees */
  agreed_contribution: number | null;
  status: string | null;
}

export type TransactionDirection = "in" | "out";

export interface Transaction extends BaseRecord {
  date: string;
  /** Integer rupees, always > 0 */
  amount: number;
  direction: TransactionDirection;
  type: string | null;
  method: string | null;
  reference: string | null;
  description: string | null;
  project_id: string | null;
  land_id: string | null;
  partner_id: string | null;
  contact_id: string | null;
  receipt_document_id: string | null;
}

export interface Document extends BaseRecord {
  title: string | null;
  doc_type: string | null;
  doc_date: string | null;
  notes: string | null;
  file_path: string | null;
  mime: string | null;
  size: number | null;
  owner_type: string | null;
  owner_id: string | null;
}

export interface Note extends BaseRecord {
  owner_type: string | null;
  owner_id: string | null;
  body: string | null;
  note_date: string | null;
}

export type CustomFieldType = "text" | "number" | "date" | "bool" | "select";

export interface CustomFieldDef extends BaseRecord {
  record_type: string;
  key: string;
  label: string;
  field_type: CustomFieldType;
  options: string | null; // JSON array
  sort_order: number;
}

export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  changed_at: string;
  old_json: string | null;
  new_json: string | null;
  actor: string | null;
}

export interface Settings {
  key: string;
  value: string | null;
}

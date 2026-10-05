CREATE TABLE IF NOT EXISTS project_sales (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL CHECK(kind IN ('flat', 'shop')),
  floor_index INTEGER NOT NULL CHECK(floor_index >= 0 AND floor_index <= 100),
  unit_number TEXT NOT NULL,
  rooms INTEGER CHECK(rooms IS NULL OR (rooms >= 1 AND rooms <= 20)),
  buyer_name TEXT NOT NULL,
  buyer_phone TEXT,
  buyer_address TEXT,
  sale_date TEXT NOT NULL,
  price INTEGER NOT NULL CHECK(price > 0),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  custom TEXT NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_sales_unit
  ON project_sales(project_id, kind, floor_index, lower(trim(unit_number))) WHERE archived = 0;
CREATE INDEX IF NOT EXISTS idx_project_sales_project_date
  ON project_sales(project_id, sale_date DESC) WHERE archived = 0;

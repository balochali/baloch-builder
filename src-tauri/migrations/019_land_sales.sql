-- Rebuild the sales table while preserving existing sales and their document IDs.
DROP TRIGGER IF EXISTS reset_business_data;
CREATE TABLE project_sales_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL CHECK(kind IN ('flat', 'shop', 'land')),
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


INSERT INTO project_sales_new SELECT * FROM project_sales;
DROP TABLE project_sales;
ALTER TABLE project_sales_new RENAME TO project_sales;
CREATE UNIQUE INDEX idx_project_sales_unit ON project_sales(project_id, kind, floor_index, lower(trim(unit_number))) WHERE archived = 0;
CREATE INDEX idx_project_sales_project_date ON project_sales(project_id, sale_date DESC) WHERE archived = 0;
CREATE UNIQUE INDEX idx_one_land_sale ON project_sales(project_id) WHERE kind = 'land' AND archived = 0;
CREATE TRIGGER land_sale_requires_acquisition BEFORE INSERT ON project_sales WHEN NEW.kind = 'land'
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM land WHERE project_id = NEW.project_id AND archived = 0 AND status = 'acquired' AND purchase_date IS NOT NULL AND purchase_date <= NEW.sale_date)
 THEN RAISE(ABORT, 'Acquire the land first. Sale date cannot precede acquisition.') END;
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id AND archived = 0)
 THEN RAISE(ABORT, 'Project not found') END;
END;
CREATE TRIGGER land_sale_updates_status AFTER INSERT ON project_sales WHEN NEW.kind = 'land' AND NEW.archived = 0
BEGIN
 UPDATE projects SET status = 'land sold', updated_at = NEW.updated_at WHERE id = NEW.project_id;
END;
CREATE TRIGGER land_sold_status_requires_sale BEFORE UPDATE OF status ON projects WHEN NEW.status = 'land sold'
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM land WHERE project_id = NEW.id AND archived = 0 AND status = 'acquired')
 OR NOT EXISTS (SELECT 1 FROM project_sales WHERE project_id = NEW.id AND kind = 'land' AND archived = 0)
 THEN RAISE(ABORT, 'Record the acquired land sale before marking Land Sold.') END;
END;

DROP TRIGGER IF EXISTS reset_business_data;
CREATE TRIGGER reset_business_data AFTER INSERT ON business_reset_requests
BEGIN
  DELETE FROM udhaar_payments;
  DELETE FROM udhaars;
  DELETE FROM transactions;
  DELETE FROM personal_expenses;
  DELETE FROM partnerships;
  DELETE FROM partners;
  DELETE FROM project_sales;
  DELETE FROM land;
  DELETE FROM project_estimates;
  DELETE FROM project_building_details;
  DELETE FROM project_milestones;
  DELETE FROM projects;
  DELETE FROM contacts;
  DELETE FROM documents;
  DELETE FROM notes;
  DELETE FROM custom_field_defs;
  DELETE FROM audit_log;
  DELETE FROM business_reset_requests WHERE id = NEW.id;
END;

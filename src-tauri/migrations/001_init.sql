-- 001_init.sql: Initial Baloch Builder SQLite Schema
-- Architecture rules:
-- 1. All tables have id TEXT PRIMARY KEY, created_at, updated_at, archived INTEGER DEFAULT 0, custom TEXT DEFAULT '{}'
--    (except settings which uses key TEXT PRIMARY KEY, value TEXT)
-- 2. Money is stored as whole integer rupees (amount INTEGER CHECK(amount > 0))
-- 3. Share percentages are basis points (10000 = 100.00%)
-- 4. Records are soft-deleted via archived = 1, never hard deleted.

-- 1. Settings (app configuration key-value store)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 2. Contacts (people: buyers, sellers, partners, contractors, agents)
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  phone2 TEXT,
  address TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  custom TEXT NOT NULL DEFAULT '{}'
);

-- 3. Projects (developments, housing schemes, commercial builds)
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  code TEXT,
  name TEXT NOT NULL,
  location TEXT,
  description TEXT,
  status TEXT,
  start_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  custom TEXT NOT NULL DEFAULT '{}'
);

-- 4. Project Milestones
CREATE TABLE IF NOT EXISTS project_milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  due_date TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  custom TEXT NOT NULL DEFAULT '{}'
);

-- 5. Land (land parcels acquired or under consideration)
CREATE TABLE IF NOT EXISTS land (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  location TEXT,
  area_value REAL,
  area_unit TEXT CHECK(area_unit IN ('marla', 'kanal', 'sqft', 'sqyd', 'acre')),
  seller_contact_id TEXT REFERENCES contacts(id),
  purchase_date TEXT,
  price INTEGER,
  status TEXT,
  project_id TEXT REFERENCES projects(id),
  is_personal INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  custom TEXT NOT NULL DEFAULT '{}'
);

-- 6. Partners
CREATE TABLE IF NOT EXISTS partners (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  status TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  custom TEXT NOT NULL DEFAULT '{}'
);

-- 7. Partnerships (project-partner links with basis points share)
CREATE TABLE IF NOT EXISTS partnerships (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  partner_id TEXT NOT NULL REFERENCES partners(id),
  share_bp INTEGER, -- basis points: 2500 = 25.00%
  agreed_contribution INTEGER, -- whole rupees
  status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  custom TEXT NOT NULL DEFAULT '{}'
);

-- 8. Transactions (single ledger for all money flows)
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  direction TEXT NOT NULL CHECK(direction IN ('in', 'out')),
  type TEXT,
  method TEXT,
  reference TEXT,
  description TEXT,
  project_id TEXT REFERENCES projects(id),
  land_id TEXT REFERENCES land(id),
  partner_id TEXT REFERENCES partners(id),
  contact_id TEXT REFERENCES contacts(id),
  receipt_document_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  custom TEXT NOT NULL DEFAULT '{}'
);

-- 9. Documents (file attachments metadata)
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  doc_type TEXT,
  doc_date TEXT,
  notes TEXT,
  file_path TEXT,
  mime TEXT,
  size INTEGER,
  owner_type TEXT,
  owner_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  custom TEXT NOT NULL DEFAULT '{}'
);

-- 10. Notes
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  owner_type TEXT,
  owner_id TEXT,
  body TEXT NOT NULL,
  note_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  custom TEXT NOT NULL DEFAULT '{}'
);

-- 11. Custom Field Definitions
CREATE TABLE IF NOT EXISTS custom_field_defs (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK(field_type IN ('text', 'number', 'date', 'bool', 'select')),
  options TEXT, -- JSON array of options for select fields
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  custom TEXT NOT NULL DEFAULT '{}'
);

-- 12. Audit Log (tracks modifications to critical records)
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  old_json TEXT,
  new_json TEXT,
  actor TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  custom TEXT NOT NULL DEFAULT '{}'
);

-- Indexes for performance and foreign key lookup
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON project_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_land_seller ON land(seller_contact_id);
CREATE INDEX IF NOT EXISTS idx_land_project ON land(project_id);
CREATE INDEX IF NOT EXISTS idx_partners_contact ON partners(contact_id);
CREATE INDEX IF NOT EXISTS idx_partnerships_project ON partnerships(project_id);
CREATE INDEX IF NOT EXISTS idx_partnerships_partner ON partnerships(partner_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_project ON transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_transactions_land ON transactions(land_id);
CREATE INDEX IF NOT EXISTS idx_transactions_partner ON transactions(partner_id);
CREATE INDEX IF NOT EXISTS idx_transactions_contact ON transactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_notes_owner ON notes(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);

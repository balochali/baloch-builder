-- Money lent to a person and repayments received against that loan.
CREATE TABLE IF NOT EXISTS udhaars (
  id TEXT PRIMARY KEY,
  borrower_name TEXT NOT NULL,
  phone TEXT,
  amount INTEGER NOT NULL CHECK(amount > 0),
  given_date TEXT NOT NULL,
  due_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  custom TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS udhaar_payments (
  id TEXT PRIMARY KEY,
  udhaar_id TEXT NOT NULL REFERENCES udhaars(id),
  amount INTEGER NOT NULL CHECK(amount > 0),
  paid_date TEXT NOT NULL,
  method TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  custom TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_udhaars_active ON udhaars(archived, given_date);
CREATE INDEX IF NOT EXISTS idx_udhaar_payments_loan ON udhaar_payments(udhaar_id, archived, paid_date);

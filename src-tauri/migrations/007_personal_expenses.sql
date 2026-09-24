CREATE TABLE IF NOT EXISTS personal_expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK(category IN ('car', 'watch', 'land', 'house', 'other')),
  item_name TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  purchase_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_personal_expenses_active_date
  ON personal_expenses(archived, purchase_date);

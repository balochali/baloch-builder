CREATE TABLE personal_deposits (
  id TEXT PRIMARY KEY,
  holder_name TEXT NOT NULL CHECK(length(trim(holder_name)) > 0),
  phone TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL CHECK(amount > 0 AND amount <= 9007199254740991),
  deposit_date TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('savings', 'partner', 'other')),
  source_details TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  account_key TEXT NOT NULL CHECK(account_key IN ('personal', 'builder')),
  method TEXT NOT NULL CHECK(method IN ('cash', 'bank', 'digital', 'cheque', 'other')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE deposit_returns (
  id TEXT PRIMARY KEY,
  deposit_id TEXT NOT NULL REFERENCES personal_deposits(id),
  amount INTEGER NOT NULL CHECK(amount > 0 AND amount <= 9007199254740991),
  return_date TEXT NOT NULL,
  account_key TEXT NOT NULL CHECK(account_key IN ('personal', 'builder')),
  method TEXT NOT NULL CHECK(method IN ('cash', 'bank', 'digital', 'cheque', 'other')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX deposit_returns_deposit ON deposit_returns(deposit_id);
CREATE INDEX personal_deposits_date ON personal_deposits(deposit_date);
CREATE TRIGGER deposit_return_guard BEFORE INSERT ON deposit_returns
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM personal_deposits d WHERE d.id = NEW.deposit_id
      AND NEW.return_date >= d.deposit_date
      AND NEW.amount <= d.amount - COALESCE((SELECT SUM(r.amount) FROM deposit_returns r WHERE r.deposit_id = d.id), 0)
  ) THEN RAISE(ABORT, 'Return exceeds the amount held or has an invalid date. Refresh and try again.') END;
END;
CREATE TRIGGER deposit_edit_guard BEFORE UPDATE ON personal_deposits
BEGIN
  SELECT CASE WHEN NEW.amount < COALESCE((SELECT SUM(amount) FROM deposit_returns WHERE deposit_id = OLD.id), 0)
    OR EXISTS (SELECT 1 FROM deposit_returns WHERE deposit_id = OLD.id AND return_date < NEW.deposit_date)
  THEN RAISE(ABORT, 'Deposit cannot conflict with its recorded returns.') END;
END;
CREATE TRIGGER reset_personal_deposits BEFORE INSERT ON business_reset_requests
BEGIN
  DELETE FROM deposit_returns;
  DELETE FROM personal_deposits;
END;

CREATE TABLE project_contractors (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT '',
  agreed_amount INTEGER NOT NULL CHECK(agreed_amount > 0 AND agreed_amount <= 9007199254740991),
  agreement_date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX project_contractors_project ON project_contractors(project_id);
CREATE INDEX transactions_contractor ON transactions(json_extract(custom, '$.contractor_id'))
  WHERE type = 'construction_cost';

CREATE TRIGGER contractor_payment_insert BEFORE INSERT ON transactions
WHEN json_extract(NEW.custom, '$.contractor_id') IS NOT NULL AND NEW.archived = 0
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM project_contractors c JOIN projects p ON p.id = c.project_id AND p.archived = 0
    WHERE c.id = json_extract(NEW.custom, '$.contractor_id') AND c.project_id = NEW.project_id
      AND NEW.type = 'construction_cost' AND NEW.direction = 'out' AND NEW.date >= c.agreement_date
      AND NEW.amount <= c.agreed_amount - COALESCE((SELECT SUM(t.amount) FROM transactions t
        WHERE t.project_id = c.project_id AND json_extract(t.custom, '$.contractor_id') = c.id
          AND t.type = 'construction_cost' AND t.direction = 'out' AND t.archived = 0), 0)
  ) THEN RAISE(ABORT, 'Check the contractor, payment date and remaining agreement balance.') END;
END;
CREATE TRIGGER contractor_payment_update BEFORE UPDATE ON transactions
WHEN json_extract(NEW.custom, '$.contractor_id') IS NOT NULL AND NEW.archived = 0
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM project_contractors c JOIN projects p ON p.id = c.project_id AND p.archived = 0
    WHERE c.id = json_extract(NEW.custom, '$.contractor_id') AND c.project_id = NEW.project_id
      AND NEW.type = 'construction_cost' AND NEW.direction = 'out' AND NEW.date >= c.agreement_date
      AND NEW.amount <= c.agreed_amount - COALESCE((SELECT SUM(t.amount) FROM transactions t
        WHERE t.id != OLD.id AND t.project_id = c.project_id AND json_extract(t.custom, '$.contractor_id') = c.id
          AND t.type = 'construction_cost' AND t.direction = 'out' AND t.archived = 0), 0)
  ) THEN RAISE(ABORT, 'Check the contractor, payment date and remaining agreement balance.') END;
END;
CREATE TRIGGER contractor_agreement_update BEFORE UPDATE ON project_contractors
BEGIN
  SELECT CASE WHEN NEW.project_id != OLD.project_id OR
    NEW.agreed_amount < COALESCE((SELECT SUM(t.amount) FROM transactions t
      WHERE json_extract(t.custom, '$.contractor_id') = OLD.id AND t.project_id = OLD.project_id
        AND t.type = 'construction_cost' AND t.direction = 'out' AND t.archived = 0), 0)
    OR EXISTS (SELECT 1 FROM transactions t WHERE json_extract(t.custom, '$.contractor_id') = OLD.id
      AND t.archived = 0 AND t.date < NEW.agreement_date)
  THEN RAISE(ABORT, 'Agreement cannot conflict with payments already recorded.') END;
END;

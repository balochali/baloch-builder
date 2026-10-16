CREATE TABLE partner_funding_rounds (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  allocations TEXT NOT NULL CHECK(json_valid(allocations)),
  created_at TEXT NOT NULL
);
CREATE INDEX partner_funding_project ON partner_funding_rounds(project_id);
CREATE TRIGGER partner_construction_insert BEFORE INSERT ON transactions
WHEN NEW.archived = 0 AND json_extract(NEW.custom, '$.contribution_purpose') = 'construction'
BEGIN
 SELECT CASE WHEN NEW.type != 'partner_contribution' OR NEW.direction != 'in' OR NOT EXISTS (
   SELECT 1 FROM partner_funding_rounds r, json_each(r.allocations) a
   WHERE r.id = json_extract(NEW.custom, '$.funding_round_id') AND r.project_id = NEW.project_id
     AND json_extract(a.value, '$.partner_id') = NEW.partner_id
     AND NEW.amount <= json_extract(a.value, '$.amount') - COALESCE((
       SELECT SUM(t.amount) FROM transactions t WHERE t.archived = 0 AND t.type = 'partner_contribution'
         AND t.direction = 'in' AND t.project_id = NEW.project_id AND t.partner_id = NEW.partner_id
         AND json_extract(t.custom, '$.funding_round_id') = r.id AND t.id != NEW.id
         AND json_extract(t.custom, '$.contribution_purpose') = 'construction'
     ), 0)
 ) THEN RAISE(ABORT, 'Construction payment exceeds this partner share or funding round is invalid') END;
END;
CREATE TRIGGER partner_construction_update BEFORE UPDATE ON transactions
WHEN NEW.archived = 0 AND json_extract(NEW.custom, '$.contribution_purpose') = 'construction'
BEGIN
 SELECT CASE WHEN NEW.type != 'partner_contribution' OR NEW.direction != 'in' OR NOT EXISTS (
   SELECT 1 FROM partner_funding_rounds r, json_each(r.allocations) a
   WHERE r.id = json_extract(NEW.custom, '$.funding_round_id') AND r.project_id = NEW.project_id
     AND json_extract(a.value, '$.partner_id') = NEW.partner_id
     AND NEW.amount <= json_extract(a.value, '$.amount') - COALESCE((
       SELECT SUM(t.amount) FROM transactions t WHERE t.archived = 0 AND t.type = 'partner_contribution'
         AND t.direction = 'in' AND t.project_id = NEW.project_id AND t.partner_id = NEW.partner_id
         AND json_extract(t.custom, '$.funding_round_id') = r.id AND t.id != NEW.id
         AND json_extract(t.custom, '$.contribution_purpose') = 'construction'
     ), 0)
 ) THEN RAISE(ABORT, 'Construction payment exceeds this partner share or funding round is invalid') END;
END;

CREATE TABLE IF NOT EXISTS project_estimates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL CHECK(kind IN ('cost', 'revenue')),
  title TEXT NOT NULL,
  details TEXT,
  minimum_amount INTEGER NOT NULL CHECK(minimum_amount >= 0),
  maximum_amount INTEGER NOT NULL CHECK(maximum_amount >= minimum_amount),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  custom TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_project_estimates_project
  ON project_estimates(project_id, kind, archived);

CREATE TABLE projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL REFERENCES users(id)
);
CREATE UNIQUE INDEX project_name_unique ON projects (lower(btrim(name)));
CREATE TRIGGER projects_audit AFTER INSERT OR UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION audit_change();

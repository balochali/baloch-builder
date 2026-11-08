-- Supplemental project registers. These do not post to the general ledger.
CREATE TABLE project_workbook_rows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES projects(id),
 sheet text NOT NULL CHECK(sheet IN ('partners','construction','estimate','flats')),
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workbook_project_sheet ON project_workbook_rows(project_id,sheet);
CREATE UNIQUE INDEX workbook_flat_number ON project_workbook_rows(project_id,lower(btrim(data->>'number'))) WHERE sheet='flats';
CREATE FUNCTION guard_workbook_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM accounting_lock();
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=actor_id() AND active AND role='admin') THEN RAISE EXCEPTION 'Only administrators may edit project registers'; END IF;
 IF EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND archived) THEN RAISE EXCEPTION 'Unarchive the project before editing registers'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.project_id<>OLD.project_id OR NEW.sheet<>OLD.sheet OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Protected register fields'; END IF;
  NEW.version=OLD.version+1;
 ELSE
  IF NEW.created_by<>actor_id() THEN RAISE EXCEPTION 'Invalid register author'; END IF;
  NEW.version=1;
 END IF;
 IF NEW.sheet='partners' THEN
  IF coalesce((NEW.data->>'share')::numeric,0)<0 OR coalesce((NEW.data->>'share')::numeric,0)+(SELECT coalesce(sum((data->>'share')::numeric),0) FROM project_workbook_rows WHERE project_id=NEW.project_id AND sheet='partners' AND id<>NEW.id)>100 THEN RAISE EXCEPTION 'Partner shares cannot exceed 100 percent'; END IF;
 END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER workbook_guard BEFORE INSERT OR UPDATE ON project_workbook_rows FOR EACH ROW EXECUTE FUNCTION guard_workbook_row();
CREATE TRIGGER workbook_audit AFTER INSERT OR UPDATE ON project_workbook_rows FOR EACH ROW EXECUTE FUNCTION audit_change();
CREATE TRIGGER workbook_no_delete BEFORE DELETE ON project_workbook_rows FOR EACH ROW EXECUTE FUNCTION no_delete();

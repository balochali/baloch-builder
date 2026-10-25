ALTER TABLE projects
 ADD COLUMN type text NOT NULL DEFAULT 'other' CHECK(type IN ('apartments','commercial','mixed_use','plots','other')),
 ADD COLUMN city text NOT NULL DEFAULT 'Unspecified',
 ADD COLUMN area_name text, ADD COLUMN address text,
 ADD COLUMN status text NOT NULL DEFAULT 'planning' CHECK(status IN ('planning','land_acquisition','approvals','construction','sales','handover','closed')),
 ADD COLUMN start_date date, ADD COLUMN planned_end_date date,
 ADD COLUMN land_area_sqft numeric, ADD COLUMN covered_area_sqft numeric, ADD COLUMN saleable_area_sqft numeric,
 ADD COLUMN project_manager_id uuid REFERENCES users(id),
 ADD COLUMN cost_allocation_method text NOT NULL DEFAULT 'saleable_area' CHECK(cost_allocation_method IN ('saleable_area','sale_value')),
 ADD COLUMN revenue_recognition text NOT NULL DEFAULT 'on_handover' CHECK(revenue_recognition IN ('on_handover')),
 ADD COLUMN notes text, ADD COLUMN archived_at timestamptz,
 ADD CONSTRAINT project_code_format CHECK(code ~ '^[A-Za-z0-9-]{2,20}$'),
 ADD CONSTRAINT project_name_valid CHECK(name=btrim(name) AND length(name) BETWEEN 1 AND 120),
 ADD CONSTRAINT project_city_valid CHECK(city=btrim(city) AND length(city) BETWEEN 1 AND 120),
 ADD CONSTRAINT project_dates_valid CHECK(planned_end_date IS NULL OR start_date IS NULL OR planned_end_date>=start_date),
 ADD CONSTRAINT project_areas_valid CHECK((land_area_sqft IS NULL OR land_area_sqft>=0 AND land_area_sqft<'Infinity'::numeric) AND (covered_area_sqft IS NULL OR covered_area_sqft>=0 AND covered_area_sqft<'Infinity'::numeric) AND (saleable_area_sqft IS NULL OR saleable_area_sqft>=0 AND saleable_area_sqft<'Infinity'::numeric)),
 ADD CONSTRAINT project_notes_valid CHECK(length(notes)<=4000);
CREATE UNIQUE INDEX projects_code_ci ON projects(lower(code));
UPDATE projects SET archived_at=updated_at WHERE archived;
ALTER TABLE projects ADD CONSTRAINT project_archive_consistent CHECK(archived=(archived_at IS NOT NULL));
CREATE TABLE project_buildings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120), floors integer NOT NULL CHECK(floors>=0), sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX project_building_name_ci ON project_buildings(project_id,lower(name));
CREATE TABLE project_status_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id),
 from_status text, to_status text NOT NULL, changed_by uuid NOT NULL REFERENCES users(id), changed_at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL DEFAULT ''
);
REVOKE UPDATE, DELETE, TRUNCATE ON project_status_history FROM baloch_app;
GRANT SELECT, INSERT ON project_status_history TO baloch_app;
GRANT DELETE ON project_buildings TO baloch_app;
CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON project_status_history FOR EACH STATEMENT EXECUTE FUNCTION immutable_audit();
CREATE TRIGGER history_audit AFTER INSERT ON project_status_history FOR EACH ROW EXECUTE FUNCTION audit_change();
CREATE TRIGGER buildings_audit AFTER INSERT OR UPDATE ON project_buildings FOR EACH ROW EXECUTE FUNCTION audit_change();
CREATE FUNCTION guard_project_profile() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r text; statuses text[]=ARRAY['planning','land_acquisition','approvals','construction','sales','handover'];
BEGIN
 PERFORM accounting_lock();
 SELECT role INTO r FROM users WHERE id=actor_id() AND active;
 IF r IS NULL OR r NOT IN ('admin','accountant') THEN RAISE EXCEPTION 'Project edit permission denied'; END IF;
 IF TG_OP='INSERT' AND (r<>'admin' OR NEW.status<>'planning') THEN RAISE EXCEPTION 'Admin must create projects in planning'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Project identity is immutable'; END IF;
  IF r='accountant' AND (to_jsonb(NEW)-ARRAY['cost_allocation_method','revenue_recognition','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['cost_allocation_method','revenue_recognition','updated_at']) THEN RAISE EXCEPTION 'Accountant may edit allocation and revenue settings only'; END IF;
  IF NEW.code<>OLD.code AND EXISTS(SELECT 1 FROM voucher_lines WHERE project_id=OLD.id) THEN RAISE EXCEPTION 'Project code cannot change after a voucher line exists'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
   IF NEW.status='closed' OR OLD.status='closed' THEN RAISE EXCEPTION 'Closed is reserved for Task 10'; END IF;
   IF array_position(statuses,NEW.status)<array_position(statuses,OLD.status) AND length(btrim(coalesce(current_setting('app.status_reason',true),'')))=0 THEN RAISE EXCEPTION 'A written reason is required when moving backward'; END IF;
  END IF;
 END IF;
 IF NEW.project_manager_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.project_manager_id AND active) THEN RAISE EXCEPTION 'Project manager must be an active user'; END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER project_profile_guard BEFORE INSERT OR UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION guard_project_profile();
CREATE FUNCTION record_project_status() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
  INSERT INTO project_status_history(project_id,from_status,to_status,changed_by,reason) VALUES(NEW.id,CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END,NEW.status,actor_id(),coalesce(current_setting('app.status_reason',true),''));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER project_status_record AFTER INSERT OR UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION record_project_status();
CREATE FUNCTION guard_building() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM accounting_lock();
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=actor_id() AND active AND role='admin') THEN RAISE EXCEPTION 'Admin permission required'; END IF;
 IF TG_OP='DELETE' THEN
  INSERT INTO audit_log(actor_id,action,entity,entity_id,old_value) VALUES(actor_id(),'delete','project_buildings',OLD.id::text,to_jsonb(OLD));
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.project_id<>OLD.project_id OR NEW.created_by<>OLD.created_by) THEN RAISE EXCEPTION 'Building identity is immutable'; END IF;
 NEW.name=btrim(NEW.name); NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER building_guard BEFORE INSERT OR UPDATE OR DELETE ON project_buildings FOR EACH ROW EXECUTE FUNCTION guard_building();
-- Existing line_guard rejects new lines for archived projects. Also reject any
-- draft header edit/post referencing an archived project, serialized with archive.
CREATE FUNCTION guard_voucher_project_archive() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM accounting_lock();
 IF EXISTS(SELECT 1 FROM voucher_lines l JOIN projects p ON p.id=l.project_id WHERE l.voucher_id=NEW.id AND NOT l.archived AND p.archived) THEN RAISE EXCEPTION 'Archived projects cannot be used in draft or posted vouchers'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER voucher_archive_guard BEFORE INSERT OR UPDATE ON vouchers FOR EACH ROW EXECUTE FUNCTION guard_voucher_project_archive();

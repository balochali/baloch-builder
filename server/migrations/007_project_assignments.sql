CREATE FUNCTION guard_project_assignment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM accounting_lock();
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=actor_id() AND active AND role='admin') THEN RAISE EXCEPTION 'Only Admin can assign project users'; END IF;
 IF TG_OP='UPDATE' AND (NEW.project_id<>OLD.project_id OR NEW.user_id<>OLD.user_id OR NEW.created_by<>OLD.created_by OR NEW.id<>OLD.id) THEN RAISE EXCEPTION 'Assignment identity is immutable'; END IF;
 IF NEW.active THEN
  PERFORM 1 FROM users WHERE id=NEW.user_id AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cannot assign an inactive user'; END IF;
 END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER assignment_guard BEFORE INSERT OR UPDATE ON project_assignments FOR EACH ROW EXECUTE FUNCTION guard_project_assignment();

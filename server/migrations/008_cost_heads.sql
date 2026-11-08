CREATE TABLE cost_heads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL CHECK(code ~ '^[A-Za-z0-9-]{2,40}$'),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160), parent_id uuid REFERENCES cost_heads(id),
 default_account_id uuid REFERENCES accounts(id), budget_only boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
 sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0), is_system boolean NOT NULL DEFAULT false, seed_key text UNIQUE,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cost_head_code_ci ON cost_heads(lower(code));
CREATE FUNCTION guard_cost_head() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM accounting_lock(); PERFORM financial_actor();
 IF NEW.parent_id IS NOT NULL THEN
  IF NEW.parent_id=NEW.id OR NOT EXISTS(SELECT 1 FROM cost_heads WHERE id=NEW.parent_id AND parent_id IS NULL) OR EXISTS(SELECT 1 FROM cost_heads WHERE parent_id=NEW.id) THEN RAISE EXCEPTION 'Cost heads allow one level of nesting only'; END IF;
 END IF;
 IF NEW.default_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.default_account_id AND NOT archived) THEN RAISE EXCEPTION 'Default account must be active'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.created_by<>OLD.created_by OR NEW.is_system<>OLD.is_system OR NEW.seed_key IS DISTINCT FROM OLD.seed_key THEN RAISE EXCEPTION 'Protected cost head fields'; END IF;
  IF NEW.code<>OLD.code AND EXISTS(SELECT 1 FROM voucher_lines l WHERE to_jsonb(l)->>'cost_head_id'=OLD.id::text) THEN RAISE EXCEPTION 'Cost head code cannot change once used'; END IF;
 END IF;
 NEW.name=btrim(NEW.name); NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER cost_head_guard BEFORE INSERT OR UPDATE ON cost_heads FOR EACH ROW EXECUTE FUNCTION guard_cost_head();
CREATE TRIGGER cost_head_audit AFTER INSERT OR UPDATE ON cost_heads FOR EACH ROW EXECUTE FUNCTION audit_change();
CREATE TRIGGER cost_head_no_delete BEFORE DELETE ON cost_heads FOR EACH ROW EXECUTE FUNCTION no_delete();

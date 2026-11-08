CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE CHECK(email=lower(email)), password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('admin','accountant','sales','construction')), active boolean NOT NULL DEFAULT true,
 totp_secret text, totp_pending text, totp_last_step bigint,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id)
);
CREATE TABLE sessions (token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE,name text NOT NULL,archived boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES users(id));
CREATE TABLE project_assignments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES projects(id),user_id uuid NOT NULL REFERENCES users(id),active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES users(id),UNIQUE(project_id,user_id));
CREATE TABLE accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE,name text NOT NULL,type text NOT NULL CHECK(type IN ('asset','liability','equity','revenue','expense')),normal_balance text NOT NULL CHECK(normal_balance IN ('debit','credit')),parent_id uuid REFERENCES accounts(id),is_cash_bank boolean NOT NULL DEFAULT false,archived boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES users(id),CHECK(parent_id IS DISTINCT FROM id));
CREATE TABLE fiscal_periods (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),month date NOT NULL UNIQUE CHECK(month=date_trunc('month',month)::date),locked boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES users(id));
CREATE TABLE settings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),singleton boolean NOT NULL UNIQUE DEFAULT true CHECK(singleton),value jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES users(id));
CREATE TABLE voucher_series (type text NOT NULL,year integer NOT NULL,last_number bigint NOT NULL,PRIMARY KEY(type,year));
CREATE TABLE vouchers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text NOT NULL CHECK(type IN ('BRV','BPV','CRV','CPV','JV','PIV','SIV')),date date NOT NULL,narration text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted')),number text UNIQUE,reverses_id uuid UNIQUE REFERENCES vouchers(id),correction_of_id uuid REFERENCES vouchers(id),posted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES users(id));
CREATE TABLE voucher_lines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),voucher_id uuid NOT NULL REFERENCES vouchers(id),account_id uuid NOT NULL REFERENCES accounts(id),project_id uuid NOT NULL REFERENCES projects(id),debit bigint NOT NULL DEFAULT 0,credit bigint NOT NULL DEFAULT 0,narration text NOT NULL DEFAULT '',partner_id uuid,supplier_id uuid,buyer_id uuid,unit_id uuid,archived boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES users(id),CHECK((debit>0 AND credit=0) OR (credit>0 AND debit=0)));
CREATE INDEX voucher_lines_voucher ON voucher_lines(voucher_id);
CREATE INDEX voucher_lines_project_account ON voucher_lines(project_id,account_id);
CREATE TABLE attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),voucher_id uuid NOT NULL REFERENCES vouchers(id),filename text NOT NULL,storage_key text NOT NULL UNIQUE,content_type text NOT NULL,size integer NOT NULL CHECK(size>0 AND size<=10485760),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES users(id));
CREATE TABLE saved_views (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),screen text NOT NULL,value jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES users(id),UNIQUE(user_id,screen));
CREATE TABLE audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid REFERENCES users(id),action text NOT NULL,entity text NOT NULL,entity_id text,old_value jsonb,new_value jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION actor_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.actor_id',true),'')::uuid $$;
CREATE FUNCTION accounting_lock() RETURNS void LANGUAGE sql AS $$ SELECT pg_advisory_xact_lock(782105) $$;
CREATE FUNCTION financial_actor() RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=actor_id() AND active AND role IN ('admin','accountant')) THEN RAISE EXCEPTION 'Financial permission denied'; END IF;
END $$;
CREATE FUNCTION open_period(d date) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM fiscal_periods WHERE month=date_trunc('month',d)::date AND NOT locked) THEN RAISE EXCEPTION 'Period missing or locked'; END IF;
END $$;
CREATE FUNCTION no_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Hard deletes are forbidden'; END $$;
CREATE FUNCTION audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_json jsonb; new_json jsonb;
BEGIN
 IF TG_OP='UPDATE' THEN old_json=to_jsonb(OLD); END IF;
 new_json=to_jsonb(NEW);
 IF TG_TABLE_NAME='users' THEN
  old_json=old_json-ARRAY['password_hash','totp_secret','totp_pending','totp_last_step'];
  new_json=new_json-ARRAY['password_hash','totp_secret','totp_pending','totp_last_step'];
 END IF;
 INSERT INTO audit_log(actor_id,action,entity,entity_id,old_value,new_value) VALUES(actor_id(),lower(TG_OP),TG_TABLE_NAME,NEW.id::text,old_json,new_json);
 RETURN NEW;
END $$;
CREATE FUNCTION immutable_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit log is append-only'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION immutable_audit();
CREATE FUNCTION guard_period() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM accounting_lock(); PERFORM financial_actor();
 IF TG_OP='UPDATE' AND NEW.month<>OLD.month THEN RAISE EXCEPTION 'Period month is immutable'; END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER period_guard BEFORE INSERT OR UPDATE ON fiscal_periods FOR EACH ROW EXECUTE FUNCTION guard_period();
CREATE FUNCTION guard_voucher() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n bigint; y integer; debit_total numeric; credit_total numeric; line_count integer; config jsonb;
BEGIN
 PERFORM accounting_lock(); PERFORM financial_actor(); PERFORM open_period(NEW.date);
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'draft' OR NEW.number IS NOT NULL OR NEW.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Create a draft first'; END IF;
  IF NEW.created_by<>actor_id() THEN RAISE EXCEPTION 'Invalid preparer'; END IF;
 ELSE
  IF OLD.status='posted' THEN RAISE EXCEPTION 'Posted vouchers are immutable'; END IF;
  PERFORM open_period(OLD.date);
  IF NEW.id<>OLD.id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.number IS DISTINCT FROM OLD.number OR NEW.posted_at IS DISTINCT FROM OLD.posted_at OR NEW.reverses_id IS DISTINCT FROM OLD.reverses_id THEN RAISE EXCEPTION 'Protected voucher fields'; END IF;
 END IF;
 IF NEW.reverses_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM vouchers WHERE id=NEW.reverses_id AND status='posted') THEN RAISE EXCEPTION 'Reverse a posted voucher only'; END IF;
 IF NEW.status='posted' THEN
  SELECT count(*),coalesce(sum(debit),0),coalesce(sum(credit),0) INTO line_count,debit_total,credit_total FROM voucher_lines WHERE voucher_id=NEW.id AND NOT archived;
  IF line_count<2 OR debit_total=0 OR debit_total<>credit_total THEN RAISE EXCEPTION 'Voucher must balance with at least two active lines'; END IF;
  IF EXISTS(SELECT 1 FROM voucher_lines l JOIN accounts a ON a.id=l.account_id JOIN projects p ON p.id=l.project_id WHERE l.voucher_id=NEW.id AND NOT l.archived AND (a.archived OR p.archived)) THEN RAISE EXCEPTION 'Inactive account or project'; END IF;
  SELECT value INTO config FROM settings WHERE singleton;
  IF NEW.type IN ('BPV','CPV') OR EXISTS(SELECT 1 FROM voucher_lines l JOIN accounts a ON a.id=l.account_id WHERE l.voucher_id=NEW.id AND NOT l.archived AND l.credit>0 AND a.is_cash_bank) THEN RAISE EXCEPTION 'Payment posting requires Phase 2 approval workflow'; END IF;
  IF coalesce((config->>'requireReceiptApproval')::boolean,false) AND (NEW.type IN ('BRV','CRV') OR EXISTS(SELECT 1 FROM voucher_lines l JOIN accounts a ON a.id=l.account_id WHERE l.voucher_id=NEW.id AND NOT l.archived AND l.debit>0 AND a.is_cash_bank)) THEN RAISE EXCEPTION 'Receipt approval required'; END IF;
  y=extract(year FROM NEW.date)::int - CASE WHEN extract(month FROM NEW.date)::int < coalesce((config->>'fiscalYearStartMonth')::int,7) THEN 1 ELSE 0 END;
  INSERT INTO voucher_series(type,year,last_number) VALUES(NEW.type,y,1) ON CONFLICT(type,year) DO UPDATE SET last_number=voucher_series.last_number+1 RETURNING last_number INTO n;
  NEW.number=NEW.type||'-'||y||'-'||lpad(n::text,greatest(6,length(n::text)),'0'); NEW.posted_at=now();
 END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER voucher_guard BEFORE INSERT OR UPDATE ON vouchers FOR EACH ROW EXECUTE FUNCTION guard_voucher();
CREATE FUNCTION guard_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v vouchers;
BEGIN
 PERFORM accounting_lock(); PERFORM financial_actor();
 IF TG_OP='UPDATE' AND (NEW.voucher_id<>OLD.voucher_id OR NEW.created_by<>OLD.created_by OR NEW.id<>OLD.id) THEN RAISE EXCEPTION 'Line identity is immutable'; END IF;
 SELECT * INTO v FROM vouchers WHERE id=NEW.voucher_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'draft' THEN RAISE EXCEPTION 'Only draft lines may change'; END IF;
 PERFORM open_period(v.date);
 IF NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.account_id AND NOT archived) OR NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND NOT archived) THEN RAISE EXCEPTION 'Inactive account or project'; END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER line_guard BEFORE INSERT OR UPDATE ON voucher_lines FOR EACH ROW EXECUTE FUNCTION guard_line();
CREATE FUNCTION guard_account() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM accounting_lock(); PERFORM financial_actor();
 IF NEW.parent_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.parent_id AND type=NEW.type AND NOT archived) THEN RAISE EXCEPTION 'Invalid parent account'; END IF;
  IF EXISTS(WITH RECURSIVE ancestors AS (SELECT id,parent_id FROM accounts WHERE id=NEW.parent_id UNION ALL SELECT a.id,a.parent_id FROM accounts a JOIN ancestors p ON a.id=p.parent_id) SELECT 1 FROM ancestors WHERE id=NEW.id) THEN RAISE EXCEPTION 'Account hierarchy cycle'; END IF;
  IF EXISTS(SELECT 1 FROM accounts WHERE id=NEW.parent_id AND is_cash_bank) THEN NEW.is_cash_bank=true; END IF;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.type<>OLD.type OR NEW.normal_balance<>OLD.normal_balance OR NEW.is_cash_bank<>OLD.is_cash_bank OR NEW.code<>OLD.code OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) THEN RAISE EXCEPTION 'Account classification is immutable; create a new account'; END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER account_guard BEFORE INSERT OR UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION guard_account();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['users','projects','project_assignments','accounts','fiscal_periods','settings','vouchers','voucher_lines','attachments','saved_views'] LOOP
  EXECUTE format('CREATE TRIGGER audit_changes AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION audit_change()',t);
  EXECUTE format('CREATE TRIGGER prevent_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION no_delete()',t);
 END LOOP;
END $$;

REVOKE UPDATE, DELETE ON journal_lines FROM baloch_app;
REVOKE UPDATE, DELETE ON journal_vouchers FROM baloch_app;
GRANT UPDATE(status) ON journal_vouchers TO baloch_app;

CREATE FUNCTION guard_journal_void() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status <> 'posted' OR NEW.status <> 'void' OR OLD.reversal_of IS NOT NULL
    OR (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
   RAISE EXCEPTION 'Only a posted original voucher can be voided; voucher details are immutable.' USING ERRCODE='23514';
 END IF;
 NEW.voided_at=clock_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER journal_void_only BEFORE UPDATE ON journal_vouchers
FOR EACH ROW EXECUTE FUNCTION guard_journal_void();

CREATE FUNCTION reject_journal_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Journal history cannot be rewritten or deleted.' USING ERRCODE='23514';
END $$;
CREATE TRIGGER journal_voucher_no_delete BEFORE DELETE ON journal_vouchers
FOR EACH ROW EXECUTE FUNCTION reject_journal_rewrite();
CREATE TRIGGER journal_line_no_rewrite BEFORE UPDATE OR DELETE ON journal_lines
FOR EACH ROW EXECUTE FUNCTION reject_journal_rewrite();

CREATE FUNCTION check_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE voucher text;
DECLARE n bigint;
DECLARE difference numeric;
BEGIN
 IF TG_TABLE_NAME='journal_vouchers' THEN voucher=NEW.id; ELSE voucher=NEW.voucher_id; END IF;
 SELECT count(*),COALESCE(sum(debit::numeric-credit::numeric),0) INTO n,difference
 FROM journal_lines WHERE voucher_id=voucher;
 IF n<2 OR difference<>0 THEN
   RAISE EXCEPTION 'Journal voucher % must have balanced debit and credit lines.',voucher USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_voucher_balanced AFTER INSERT ON journal_vouchers
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_balance();
CREATE CONSTRAINT TRIGGER journal_line_balanced AFTER INSERT ON journal_lines
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_balance();

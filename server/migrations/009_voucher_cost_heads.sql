ALTER TABLE voucher_lines ADD COLUMN cost_head_id uuid REFERENCES cost_heads(id);
CREATE INDEX voucher_lines_cost_head ON voucher_lines(cost_head_id);
ALTER TABLE accounts ADD COLUMN requires_cost_head boolean NOT NULL DEFAULT false;
-- Owner-only, transactional metadata backfill. Audit remains enabled; the table
-- lock prevents runtime writes while the existing actor guard is suspended.
ALTER TABLE accounts DISABLE TRIGGER account_guard;
UPDATE accounts SET requires_cost_head=true WHERE code IN ('1200','1210','1220','1230','1240') AND NOT requires_cost_head;
ALTER TABLE accounts ENABLE TRIGGER account_guard;
CREATE FUNCTION guard_account_cost_head() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.code IN ('1200','1210','1220','1230','1240') AND NOT NEW.requires_cost_head THEN RAISE EXCEPTION 'WIP accounts require cost heads'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER account_cost_head_guard BEFORE INSERT OR UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION guard_account_cost_head();
CREATE FUNCTION guard_line_cost_head() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM accounting_lock();
 IF NEW.cost_head_id IS NOT NULL AND NOT NEW.archived AND (TG_OP='INSERT' OR NEW.cost_head_id IS DISTINCT FROM OLD.cost_head_id) AND NOT EXISTS(SELECT 1 FROM cost_heads WHERE id=NEW.cost_head_id AND active AND NOT budget_only) THEN RAISE EXCEPTION 'Choose an active, non-budget-only cost head'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER line_cost_head_guard BEFORE INSERT OR UPDATE ON voucher_lines FOR EACH ROW EXECUTE FUNCTION guard_line_cost_head();
CREATE FUNCTION guard_posting_cost_heads() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM accounting_lock();
 IF NEW.status='posted' AND EXISTS(SELECT 1 FROM voucher_lines l JOIN accounts a ON a.id=l.account_id LEFT JOIN cost_heads h ON h.id=l.cost_head_id WHERE l.voucher_id=NEW.id AND NOT l.archived AND ((a.requires_cost_head AND l.cost_head_id IS NULL) OR (l.cost_head_id IS NOT NULL AND (NOT h.active OR h.budget_only)))) THEN RAISE EXCEPTION 'Posting requires an active, non-budget-only cost head for every WIP line'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER voucher_cost_heads_guard BEFORE INSERT OR UPDATE ON vouchers FOR EACH ROW EXECUTE FUNCTION guard_posting_cost_heads();
CREATE OR REPLACE FUNCTION guard_correction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.correction_of_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM vouchers WHERE id=NEW.correction_of_id AND status='posted') THEN RAISE EXCEPTION 'Corrections must link a posted voucher'; END IF;
 IF NEW.status='posted' AND NEW.reverses_id IS NOT NULL THEN
  IF EXISTS(
   (SELECT account_id,project_id,cost_head_id,partner_id,supplier_id,buyer_id,unit_id,sum(debit),sum(credit) FROM voucher_lines WHERE voucher_id=NEW.id AND NOT archived GROUP BY account_id,project_id,cost_head_id,partner_id,supplier_id,buyer_id,unit_id
    EXCEPT
    SELECT account_id,project_id,cost_head_id,partner_id,supplier_id,buyer_id,unit_id,sum(credit),sum(debit) FROM voucher_lines WHERE voucher_id=NEW.reverses_id AND NOT archived GROUP BY account_id,project_id,cost_head_id,partner_id,supplier_id,buyer_id,unit_id)
   UNION ALL
   (SELECT account_id,project_id,cost_head_id,partner_id,supplier_id,buyer_id,unit_id,sum(credit),sum(debit) FROM voucher_lines WHERE voucher_id=NEW.reverses_id AND NOT archived GROUP BY account_id,project_id,cost_head_id,partner_id,supplier_id,buyer_id,unit_id
    EXCEPT
    SELECT account_id,project_id,cost_head_id,partner_id,supplier_id,buyer_id,unit_id,sum(debit),sum(credit) FROM voucher_lines WHERE voucher_id=NEW.id AND NOT archived GROUP BY account_id,project_id,cost_head_id,partner_id,supplier_id,buyer_id,unit_id)
  ) THEN RAISE EXCEPTION 'Reversal must exactly offset original dimensions and amounts'; END IF;
 END IF;
 RETURN NEW;
END $$;

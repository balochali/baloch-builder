CREATE FUNCTION guard_correction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.correction_of_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM vouchers WHERE id=NEW.correction_of_id AND status='posted') THEN RAISE EXCEPTION 'Corrections must link a posted voucher'; END IF;
 IF NEW.status='posted' AND NEW.reverses_id IS NOT NULL THEN
  IF EXISTS(
   (SELECT account_id,project_id,partner_id,supplier_id,buyer_id,unit_id,sum(debit),sum(credit) FROM voucher_lines WHERE voucher_id=NEW.id AND NOT archived GROUP BY account_id,project_id,partner_id,supplier_id,buyer_id,unit_id
    EXCEPT
    SELECT account_id,project_id,partner_id,supplier_id,buyer_id,unit_id,sum(credit),sum(debit) FROM voucher_lines WHERE voucher_id=NEW.reverses_id AND NOT archived GROUP BY account_id,project_id,partner_id,supplier_id,buyer_id,unit_id)
   UNION ALL
   (SELECT account_id,project_id,partner_id,supplier_id,buyer_id,unit_id,sum(credit),sum(debit) FROM voucher_lines WHERE voucher_id=NEW.reverses_id AND NOT archived GROUP BY account_id,project_id,partner_id,supplier_id,buyer_id,unit_id
    EXCEPT
    SELECT account_id,project_id,partner_id,supplier_id,buyer_id,unit_id,sum(debit),sum(credit) FROM voucher_lines WHERE voucher_id=NEW.id AND NOT archived GROUP BY account_id,project_id,partner_id,supplier_id,buyer_id,unit_id)
  ) THEN RAISE EXCEPTION 'Reversal must exactly offset original dimensions and amounts'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER voucher_correction_guard BEFORE INSERT OR UPDATE ON vouchers FOR EACH ROW EXECUTE FUNCTION guard_correction();

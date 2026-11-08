CREATE FUNCTION guard_attachment() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE v vouchers; BEGIN
 PERFORM accounting_lock(); PERFORM financial_actor();
 SELECT * INTO v FROM vouchers WHERE id=NEW.voucher_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'draft' THEN RAISE EXCEPTION 'Attachments require a draft'; END IF;
 PERFORM open_period(v.date);
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Attachment metadata is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER attachment_guard BEFORE INSERT OR UPDATE ON attachments FOR EACH ROW EXECUTE FUNCTION guard_attachment();

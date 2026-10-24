CREATE TABLE sale_events (
 id TEXT PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES project_sales(id) ON DELETE CASCADE, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('cancel','resell')), date TEXT NOT NULL,
 buyer_name TEXT NOT NULL, received INTEGER NOT NULL, rate_bp INTEGER NOT NULL CHECK(rate_bp BETWEEN 0 AND 10000),
 fee INTEGER NOT NULL CHECK(fee >= 0), refund INTEGER NOT NULL CHECK(refund >= 0), resale_price INTEGER NOT NULL DEFAULT 0,
 details TEXT NOT NULL CHECK(json_valid(details)), created_at TEXT NOT NULL
);
CREATE INDEX sale_events_project ON sale_events(project_id);
CREATE TRIGGER sale_event_validate BEFORE INSERT ON sale_events BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM project_sales s WHERE s.id=NEW.sale_id AND s.project_id=NEW.project_id AND s.archived=0 AND s.kind IN ('flat','shop') AND NEW.date>=s.sale_date
 AND NEW.received=COALESCE((SELECT SUM(amount) FROM transactions WHERE type='sale_payment' AND archived=0 AND json_extract(custom,'$.sale_id')=s.id),0))
 THEN RAISE(ABORT,'Sale or received balance changed. Reopen this form.') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM transactions WHERE type='sale_payment' AND archived=0 AND json_extract(custom,'$.sale_id')=NEW.sale_id AND date>NEW.date)
 THEN RAISE(ABORT,'Choose a date on or after the latest buyer payment') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM sale_events WHERE sale_id=NEW.sale_id AND date>NEW.date) THEN RAISE(ABORT,'Settlement cannot predate earlier resale') END;
 SELECT CASE WHEN NEW.kind='cancel' AND (NEW.fee != (NEW.received/10000)*NEW.rate_bp + ((NEW.received%10000)*NEW.rate_bp)/10000 OR NEW.refund != NEW.received-NEW.fee)
 THEN RAISE(ABORT,'Cancellation deduction or refund is invalid') END;
 SELECT CASE WHEN NEW.kind='resell' AND (NEW.received != (SELECT price FROM project_sales WHERE id=NEW.sale_id) OR NEW.refund != 0 OR NEW.resale_price <= 0 OR COALESCE(json_extract(NEW.details,'$.new_buyer_name'),'')='' OR NEW.fee != (NEW.resale_price/10000)*NEW.rate_bp + ((NEW.resale_price%10000)*NEW.rate_bp)/10000)
 THEN RAISE(ABORT,'Original buyer must fully pay before resale; check resale and commission details') END;
 END;
DROP TRIGGER sale_payment_protect_sale;
CREATE TRIGGER sale_payment_protect_sale BEFORE UPDATE ON project_sales
 WHEN EXISTS(SELECT 1 FROM transactions WHERE type='sale_payment' AND archived=0 AND json_extract(custom,'$.sale_id')=OLD.id)
 BEGIN
 SELECT CASE WHEN (NEW.archived != 0 AND NOT EXISTS(SELECT 1 FROM sale_events WHERE id=json_extract(NEW.custom,'$.cancel_event_id') AND kind='cancel' AND sale_id=OLD.id))
 OR NEW.project_id != OLD.project_id OR NEW.kind NOT IN ('flat','shop')
 OR NEW.price < (SELECT SUM(amount) FROM transactions WHERE type='sale_payment' AND archived=0 AND json_extract(custom,'$.sale_id')=OLD.id)
 OR EXISTS(SELECT 1 FROM transactions WHERE type='sale_payment' AND archived=0 AND json_extract(custom,'$.sale_id')=OLD.id AND date < NEW.sale_date)
 THEN RAISE(ABORT,'Sale change conflicts with recorded payments') END;
 END;
CREATE TRIGGER sale_event_apply AFTER INSERT ON sale_events BEGIN
 INSERT INTO transactions(id,date,amount,direction,type,method,reference,description,project_id,created_at,updated_at,archived,custom,account_key)
 SELECT NEW.id,NEW.date,CASE NEW.kind WHEN 'cancel' THEN NEW.refund ELSE NEW.fee END,
 CASE NEW.kind WHEN 'cancel' THEN 'out' ELSE 'in' END,CASE NEW.kind WHEN 'cancel' THEN 'sale_refund' ELSE 'resale_commission' END,
 json_extract(NEW.details,'$.payment.method'),json_extract(NEW.details,'$.payment.reference'),CASE NEW.kind WHEN 'cancel' THEN 'Cancellation refund · ' ELSE 'Resale commission · ' END || NEW.buyer_name,
 NEW.project_id,NEW.created_at,NEW.created_at,0,json_object('sale_id',NEW.sale_id,'event_id',NEW.id,'buyer_name',NEW.buyer_name,'payment_details',json_extract(NEW.details,'$.payment.payment_details')),json_extract(NEW.details,'$.payment.account_key')
 WHERE CASE NEW.kind WHEN 'cancel' THEN NEW.refund ELSE NEW.fee END > 0;
 UPDATE project_sales SET archived=1,custom=json_set(custom,'$.cancel_event_id',NEW.id),updated_at=NEW.created_at WHERE id=NEW.sale_id AND NEW.kind='cancel';
 UPDATE project_sales SET buyer_name=json_extract(NEW.details,'$.new_buyer_name'),buyer_phone=json_extract(NEW.details,'$.new_buyer_phone'),buyer_address=json_extract(NEW.details,'$.new_buyer_address'),updated_at=NEW.created_at WHERE id=NEW.sale_id AND NEW.kind='resell';
 END;
CREATE TRIGGER sale_payment_finalized_update BEFORE UPDATE ON transactions
 WHEN OLD.type='sale_payment' AND EXISTS(SELECT 1 FROM sale_events WHERE sale_id=json_extract(OLD.custom,'$.sale_id'))
 AND (NEW.amount!=OLD.amount OR NEW.archived!=OLD.archived OR NEW.date!=OLD.date OR NEW.project_id!=OLD.project_id OR NEW.type!=OLD.type OR NEW.direction!=OLD.direction OR NEW.custom!=OLD.custom)
 BEGIN SELECT RAISE(ABORT,'Payments for a cancelled or resold sale cannot be changed'); END;

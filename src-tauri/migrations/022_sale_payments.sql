CREATE INDEX IF NOT EXISTS idx_sale_payment_link ON transactions(json_extract(custom, '$.sale_id')) WHERE type = 'sale_payment';
CREATE TRIGGER sale_payment_guard_insert BEFORE INSERT ON transactions
 WHEN NEW.archived = 0 AND NEW.type = 'sale_payment'
 BEGIN
 SELECT CASE WHEN NEW.direction != 'in' OR NOT EXISTS (
 SELECT 1 FROM project_sales s WHERE s.id = json_extract(NEW.custom, '$.sale_id') AND s.project_id = NEW.project_id
 AND s.archived = 0 AND s.kind IN ('flat','shop') AND NEW.date >= s.sale_date
 AND NEW.amount <= s.price - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.type='sale_payment' AND t.archived=0 AND t.direction='in' AND json_extract(t.custom,'$.sale_id')=s.id AND t.id != NEW.id),0)
 ) THEN RAISE(ABORT,'Payment exceeds sale balance, predates sale, or sale is invalid') END;
 END;
CREATE TRIGGER sale_payment_guard_update BEFORE UPDATE ON transactions
 WHEN NEW.archived = 0 AND NEW.type = 'sale_payment'
 BEGIN
 SELECT CASE WHEN NEW.direction != 'in' OR NOT EXISTS (
 SELECT 1 FROM project_sales s WHERE s.id = json_extract(NEW.custom, '$.sale_id') AND s.project_id = NEW.project_id
 AND s.archived = 0 AND s.kind IN ('flat','shop') AND NEW.date >= s.sale_date
 AND NEW.amount <= s.price - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.type='sale_payment' AND t.archived=0 AND t.direction='in' AND json_extract(t.custom,'$.sale_id')=s.id AND t.id != NEW.id),0)
 ) THEN RAISE(ABORT,'Payment exceeds sale balance, predates sale, or sale is invalid') END;
 END;
CREATE TRIGGER sale_initial_payment AFTER INSERT ON project_sales
 WHEN NEW.kind IN ('flat','shop') AND json_extract(NEW.custom,'$.initial_payment') IS NOT NULL
 BEGIN
 INSERT INTO transactions(id,date,amount,direction,type,method,reference,description,project_id,created_at,updated_at,archived,custom,account_key)
 VALUES(json_extract(NEW.custom,'$.initial_payment.id'),json_extract(NEW.custom,'$.initial_payment.date'),json_extract(NEW.custom,'$.initial_payment.amount'),'in','sale_payment',json_extract(NEW.custom,'$.initial_payment.method'),json_extract(NEW.custom,'$.initial_payment.reference'),'First payment · ' || NEW.buyer_name,NEW.project_id,NEW.created_at,NEW.updated_at,0,json_object('sale_id',NEW.id,'payment_details',json_extract(NEW.custom,'$.initial_payment.payment_details')),json_extract(NEW.custom,'$.initial_payment.account_key'));
 END;
CREATE TRIGGER sale_payment_protect_sale BEFORE UPDATE ON project_sales
 WHEN EXISTS(SELECT 1 FROM transactions t WHERE t.type='sale_payment' AND t.archived=0 AND json_extract(t.custom,'$.sale_id')=OLD.id)
 BEGIN
 SELECT CASE WHEN NEW.archived != 0 OR NEW.project_id != OLD.project_id OR NEW.kind NOT IN ('flat','shop')
 OR NEW.price < (SELECT SUM(amount) FROM transactions WHERE type='sale_payment' AND archived=0 AND json_extract(custom,'$.sale_id')=OLD.id)
 OR EXISTS(SELECT 1 FROM transactions WHERE type='sale_payment' AND archived=0 AND json_extract(custom,'$.sale_id')=OLD.id AND date < NEW.sale_date)
 THEN RAISE(ABORT,'Sale has recorded payments; its price, date or archive change conflicts with payments') END;
 END;

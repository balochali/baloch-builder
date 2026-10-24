DROP TRIGGER sale_event_apply;
CREATE TRIGGER sale_event_apply AFTER INSERT ON sale_events BEGIN
 INSERT INTO transactions(id,date,amount,direction,type,method,reference,description,project_id,created_at,updated_at,archived,custom,account_key)
 SELECT NEW.id,NEW.date,CASE NEW.kind WHEN 'cancel' THEN COALESCE(json_extract(NEW.details,'$.payment.amount'),0) ELSE NEW.fee END,
 CASE NEW.kind WHEN 'cancel' THEN 'out' ELSE 'in' END,CASE NEW.kind WHEN 'cancel' THEN 'sale_refund' ELSE 'resale_commission' END,
 json_extract(NEW.details,'$.payment.method'),json_extract(NEW.details,'$.payment.reference'),CASE NEW.kind WHEN 'cancel' THEN 'Cancellation refund · ' ELSE 'Resale commission · ' END || NEW.buyer_name,
 NEW.project_id,NEW.created_at,NEW.created_at,0,json_object('sale_id',NEW.sale_id,'event_id',NEW.id,'buyer_name',NEW.buyer_name,'payment_details',json_extract(NEW.details,'$.payment.payment_details')),json_extract(NEW.details,'$.payment.account_key')
 WHERE CASE NEW.kind WHEN 'cancel' THEN COALESCE(json_extract(NEW.details,'$.payment.amount'),0) ELSE NEW.fee END > 0;
 UPDATE project_sales SET archived=1,custom=json_set(custom,'$.cancel_event_id',NEW.id),updated_at=NEW.created_at WHERE id=NEW.sale_id AND NEW.kind='cancel';
 UPDATE project_sales SET buyer_name=json_extract(NEW.details,'$.new_buyer_name'),buyer_phone=json_extract(NEW.details,'$.new_buyer_phone'),buyer_address=json_extract(NEW.details,'$.new_buyer_address'),updated_at=NEW.created_at WHERE id=NEW.sale_id AND NEW.kind='resell';
 END;

CREATE TRIGGER sale_refund_validate_insert BEFORE INSERT ON transactions
WHEN NEW.type='sale_refund' AND NEW.archived=0
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sale_events e WHERE e.id=json_extract(NEW.custom,'$.event_id') AND e.kind='cancel' AND e.sale_id=json_extract(NEW.custom,'$.sale_id') AND e.project_id=NEW.project_id AND NEW.direction='out' AND NEW.date>=e.date AND NEW.amount>0 AND NEW.amount<=e.refund-COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.type='sale_refund' AND t.archived=0 AND json_extract(t.custom,'$.event_id')=e.id AND t.id!=NEW.id),0)) THEN RAISE(ABORT,'Refund exceeds remaining balance, predates cancellation or belongs to another sale') END;
END;

CREATE TRIGGER sale_refund_validate_update BEFORE UPDATE ON transactions
WHEN NEW.type='sale_refund' AND NEW.archived=0
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sale_events e WHERE e.id=json_extract(NEW.custom,'$.event_id') AND e.kind='cancel' AND e.sale_id=json_extract(NEW.custom,'$.sale_id') AND e.project_id=NEW.project_id AND NEW.direction='out' AND NEW.date>=e.date AND NEW.amount>0 AND NEW.amount<=e.refund-COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.type='sale_refund' AND t.archived=0 AND json_extract(t.custom,'$.event_id')=e.id AND t.id!=NEW.id),0)) THEN RAISE(ABORT,'Refund exceeds remaining balance, predates cancellation or belongs to another sale') END;
END;

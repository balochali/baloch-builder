INSERT INTO accounts(code,name,class,is_system) VALUES('4100','Other Income (forfeited bookings)','Revenue',true) ON CONFLICT DO NOTHING;
ALTER TABLE parties ADD COLUMN cnic text NOT NULL DEFAULT '', ADD COLUMN second_contact text NOT NULL DEFAULT '';
CREATE TABLE sale_units (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id), unit_no text NOT NULL,
 category text NOT NULL CHECK(category IN ('Flat','Shop','Office','Other')), floor_label text NOT NULL DEFAULT '', source_unit_type_id uuid,
 source_serial integer, source_snapshot jsonb, size_sqft numeric NOT NULL DEFAULT 0 CHECK(size_sqft>=0), bedrooms integer NOT NULL DEFAULT 0 CHECK(bedrooms>=0), bathrooms integer NOT NULL DEFAULT 0 CHECK(bathrooms>=0),
 facing text NOT NULL DEFAULT '', list_price bigint NOT NULL DEFAULT 0 CHECK(list_price>=0), notes text NOT NULL DEFAULT '', is_active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1, created_by uuid NOT NULL DEFAULT nullif(current_setting('app.actor_id',true),'')::uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,unit_no), UNIQUE(project_id,source_unit_type_id,source_serial)
);
CREATE TABLE sale_agreements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id), unit_id uuid NOT NULL REFERENCES sale_units(id), customer_party_id uuid NOT NULL REFERENCES parties(id),
 agreement_date date NOT NULL, total_price bigint NOT NULL CHECK(total_price>0), discount bigint NOT NULL DEFAULT 0 CHECK(discount>=0), plan_type text NOT NULL CHECK(plan_type IN ('full','installments','custom')),
 notes text NOT NULL DEFAULT '', second_buyer_name text NOT NULL DEFAULT '', reference text NOT NULL DEFAULT '', handover_date date, handover_voucher_id text REFERENCES journal_vouchers(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')), version integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL DEFAULT nullif(current_setting('app.actor_id',true),'')::uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), CHECK((handover_date IS NULL)=(handover_voucher_id IS NULL))
);
CREATE UNIQUE INDEX sale_one_active ON sale_agreements(unit_id) WHERE status='active';
CREATE TABLE sale_installments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agreement_id uuid NOT NULL REFERENCES sale_agreements(id), seq integer NOT NULL CHECK(seq>0), label text NOT NULL, due_date date NOT NULL, amount bigint NOT NULL CHECK(amount>0),
 version integer NOT NULL DEFAULT 1, created_by uuid NOT NULL DEFAULT nullif(current_setting('app.actor_id',true),'')::uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(agreement_id,seq)
);
CREATE SEQUENCE sale_receipt_number;
CREATE TABLE sale_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agreement_id uuid NOT NULL REFERENCES sale_agreements(id), received_on date NOT NULL, amount bigint NOT NULL CHECK(amount>0),
 method text NOT NULL CHECK(method IN ('cash','bank_transfer','cheque','online','other')), reference text NOT NULL DEFAULT '', deposited_to text NOT NULL CHECK(deposited_to IN ('bank','cash')), notes text NOT NULL DEFAULT '',
 installment_id uuid REFERENCES sale_installments(id), receipt_no text NOT NULL UNIQUE DEFAULT ('R-' || lpad(nextval('sale_receipt_number')::text,8,'0')), status text NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','void')),
 voucher_id text NOT NULL UNIQUE REFERENCES journal_vouchers(id), after_handover boolean NOT NULL,
 created_by uuid NOT NULL DEFAULT nullif(current_setting('app.actor_id',true),'')::uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sale_cancellations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agreement_id uuid NOT NULL UNIQUE REFERENCES sale_agreements(id), cancelled_on date NOT NULL, reason text NOT NULL,
 refund_amount bigint NOT NULL CHECK(refund_amount>=0), forfeited_amount bigint NOT NULL CHECK(forfeited_amount>=0), refund_paid_from text NOT NULL CHECK(refund_paid_from IN ('bank','cash')),
 refund_voucher_id text REFERENCES journal_vouchers(id), status text NOT NULL DEFAULT 'posted' CHECK(status='posted'),
 created_by uuid NOT NULL DEFAULT nullif(current_setting('app.actor_id',true),'')::uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sale_agreements_project ON sale_agreements(project_id);
CREATE INDEX sale_payments_agreement ON sale_payments(agreement_id);
GRANT SELECT,INSERT ON sale_units,sale_agreements,sale_installments,sale_payments,sale_cancellations TO baloch_app;
REVOKE UPDATE,DELETE ON sale_units,sale_agreements,sale_installments,sale_payments,sale_cancellations FROM baloch_app;
GRANT USAGE ON SEQUENCE sale_receipt_number TO baloch_app;

CREATE FUNCTION check_sale_schedule() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE aid uuid; price bigint; scheduled numeric;
BEGIN
 aid=CASE WHEN TG_TABLE_NAME='sale_agreements' THEN NEW.id ELSE coalesce(NEW.agreement_id,OLD.agreement_id) END;
 SELECT total_price INTO price FROM sale_agreements WHERE id=aid;
 SELECT coalesce(sum(amount),0) INTO scheduled FROM sale_installments WHERE agreement_id=aid;
 IF scheduled<>price THEN RAISE EXCEPTION 'Payment plan total must equal the sale price' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER sale_schedule_agreement AFTER INSERT OR UPDATE ON sale_agreements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_sale_schedule();
CREATE CONSTRAINT TRIGGER sale_schedule_rows AFTER INSERT OR UPDATE OR DELETE ON sale_installments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_sale_schedule();

CREATE FUNCTION edit_sale_unit(uid uuid, expected integer, data jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.sale_units WHERE id=uid AND version=expected FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'This unit changed. Refresh and try again'; END IF;
 IF EXISTS(SELECT 1 FROM public.sale_agreements WHERE unit_id=uid AND (status='active' OR (data->>'is_active')::boolean=false)) THEN RAISE EXCEPTION 'A unit with an agreement cannot be changed or deactivated'; END IF;
 UPDATE public.sale_units SET unit_no=data->>'unit_no',category=data->>'category',floor_label=data->>'floor_label',size_sqft=(data->>'size_sqft')::numeric,bedrooms=(data->>'bedrooms')::integer,bathrooms=(data->>'bathrooms')::integer,facing=data->>'facing',list_price=(data->>'list_price')::bigint,notes=data->>'notes',is_active=(data->>'is_active')::boolean,version=version+1 WHERE id=uid;
END $$;
REVOKE ALL ON FUNCTION edit_sale_unit(uuid,integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION edit_sale_unit(uuid,integer,jsonb) TO baloch_app;

CREATE FUNCTION void_sale_payment(pid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE vid text; aid uuid;
BEGIN
 SELECT voucher_id,agreement_id INTO vid,aid FROM public.sale_payments WHERE id=pid AND status='posted' FOR UPDATE;
 IF vid IS NULL OR NOT EXISTS(SELECT 1 FROM public.journal_vouchers WHERE id=vid AND status='void') OR NOT EXISTS(SELECT 1 FROM public.journal_vouchers WHERE reversal_of=vid) THEN RAISE EXCEPTION 'Reverse the payment before voiding it'; END IF;
 IF EXISTS(SELECT 1 FROM public.sale_agreements WHERE id=aid AND status='cancelled') THEN RAISE EXCEPTION 'Cancelled sale payments remain recorded'; END IF;
 UPDATE public.sale_payments SET status='void' WHERE id=pid;
 UPDATE public.sale_agreements SET version=version+1 WHERE id=aid;
END $$;
REVOKE ALL ON FUNCTION void_sale_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION void_sale_payment(uuid) TO baloch_app;

CREATE FUNCTION transition_sale(aid uuid, expected integer, action text, vid text, day date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.sale_agreements; r numeric; c public.sale_cancellations;
BEGIN
 SELECT * INTO a FROM public.sale_agreements WHERE id=aid AND version=expected AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'This sale changed. Refresh and try again'; END IF;
 IF action='handover' THEN
  IF a.handover_voucher_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.journal_vouchers WHERE id=vid AND status='posted' AND source->>'module'='sale_handover' AND source->>'refId'=aid::text) THEN RAISE EXCEPTION 'Post handover before marking it complete'; END IF;
  UPDATE public.sale_agreements SET handover_date=day,handover_voucher_id=vid,version=version+1 WHERE id=aid;
 ELSIF action='void_handover' THEN
  IF a.handover_voucher_id IS NULL OR EXISTS(SELECT 1 FROM public.sale_payments WHERE agreement_id=aid AND after_handover AND status='posted') OR NOT EXISTS(SELECT 1 FROM public.journal_vouchers WHERE reversal_of=a.handover_voucher_id) THEN RAISE EXCEPTION 'Reverse handover only when no later payments remain'; END IF;
  UPDATE public.sale_agreements SET handover_date=NULL,handover_voucher_id=NULL,version=version+1 WHERE id=aid;
 ELSIF action='cancel' THEN
  SELECT * INTO c FROM public.sale_cancellations WHERE agreement_id=aid;
  SELECT coalesce(sum(l.debit),0) INTO r FROM public.sale_payments p JOIN public.journal_vouchers v ON v.id=p.voucher_id JOIN public.journal_lines l ON l.voucher_id=v.id WHERE p.agreement_id=aid AND p.status='posted' AND v.status='posted' AND v.reversal_of IS NULL AND l.account_code IN ('1000','1010');
  IF a.handover_date IS NOT NULL OR c.id IS NULL OR c.refund_amount+c.forfeited_amount<>r OR (r>0 AND NOT EXISTS(SELECT 1 FROM public.journal_vouchers WHERE id=c.refund_voucher_id AND status='posted' AND source->>'module'='sale_cancel' AND source->>'refId'=aid::text)) THEN RAISE EXCEPTION 'Record the matching refund and forfeiture before cancelling'; END IF;
  UPDATE public.sale_agreements SET status='cancelled',version=version+1 WHERE id=aid;
 ELSE RAISE EXCEPTION 'Unknown sale action'; END IF;
END $$;
REVOKE ALL ON FUNCTION transition_sale(uuid,integer,text,text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION transition_sale(uuid,integer,text,text,date) TO baloch_app;

CREATE FUNCTION edit_sale_plan(aid uuid, expected integer, data jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.sale_agreements; item jsonb; received numeric; oldrow public.sale_installments; allocated numeric; remaining numeric;
BEGIN
 SELECT * INTO a FROM public.sale_agreements WHERE id=aid AND version=expected AND status='active' FOR UPDATE;
 IF NOT FOUND OR a.handover_date IS NOT NULL THEN RAISE EXCEPTION 'Only an active sale before handover can be edited'; END IF;
 SELECT coalesce(sum(l.debit),0) INTO received FROM public.sale_payments p JOIN public.journal_vouchers v ON v.id=p.voucher_id JOIN public.journal_lines l ON l.voucher_id=v.id WHERE p.agreement_id=aid AND p.status='posted' AND v.status='posted' AND v.reversal_of IS NULL AND l.account_code IN ('1000','1010');
 IF (data->>'total_price')::bigint<received THEN RAISE EXCEPTION 'Price cannot be less than money already received'; END IF;
 remaining=received;
 FOR oldrow IN SELECT * FROM public.sale_installments WHERE agreement_id=aid ORDER BY due_date,seq LOOP
  allocated=least(remaining,oldrow.amount); remaining=remaining-allocated;
  IF allocated>0 THEN
   SELECT value INTO item FROM jsonb_array_elements(data->'schedule') WHERE (value->>'id')::uuid=oldrow.id;
   IF item IS NULL OR (item->>'amount')::bigint<allocated OR item->>'due_date'<>oldrow.due_date::text OR item->>'label'<>oldrow.label THEN RAISE EXCEPTION 'Only the unpaid part of the payment plan can change'; END IF;
  END IF;
 END LOOP;
 DELETE FROM public.sale_installments s WHERE agreement_id=aid AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(data->'schedule') x WHERE x->>'id'=s.id::text) AND NOT EXISTS(SELECT 1 FROM public.sale_payments WHERE installment_id=s.id);
 FOR item IN SELECT value FROM jsonb_array_elements(data->'schedule') LOOP
  IF item->>'id' IS NOT NULL THEN
   UPDATE public.sale_installments SET label=item->>'label',due_date=(item->>'due_date')::date,amount=(item->>'amount')::bigint,version=version+1 WHERE id=(item->>'id')::uuid AND agreement_id=aid;
   IF NOT FOUND THEN RAISE EXCEPTION 'Payment plan row not found'; END IF;
  ELSE
   INSERT INTO public.sale_installments(agreement_id,seq,label,due_date,amount) VALUES(aid,(item->>'seq')::integer,item->>'label',(item->>'due_date')::date,(item->>'amount')::bigint);
  END IF;
 END LOOP;
 UPDATE public.sale_agreements SET total_price=(data->>'total_price')::bigint,discount=(data->>'discount')::bigint,notes=data->>'notes',version=version+1 WHERE id=aid;
END $$;
REVOKE ALL ON FUNCTION edit_sale_plan(uuid,integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION edit_sale_plan(uuid,integer,jsonb) TO baloch_app;

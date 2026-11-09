CREATE TABLE land_purchases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id),
 parcel_id uuid NOT NULL, seller_party_id uuid NOT NULL REFERENCES parties(id),
 agreed_price bigint NOT NULL CHECK(agreed_price>0), agreement_date date NOT NULL, notes text NOT NULL DEFAULT '',
 voucher_id text NOT NULL UNIQUE REFERENCES journal_vouchers(id), status text NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','void')),
 created_by uuid NOT NULL DEFAULT nullif(current_setting('app.actor_id',true),'')::uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX land_purchase_active ON land_purchases(project_id,parcel_id) WHERE status='posted';
CREATE TABLE land_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purchase_id uuid NOT NULL REFERENCES land_purchases(id),
 paid_on date NOT NULL, notes text NOT NULL DEFAULT '', reference text NOT NULL DEFAULT '',
 voucher_id text NOT NULL UNIQUE REFERENCES journal_vouchers(id), status text NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','void')),
 created_by uuid NOT NULL DEFAULT nullif(current_setting('app.actor_id',true),'')::uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE land_payment_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL REFERENCES land_payments(id),
 source_type text NOT NULL CHECK(source_type IN ('bank','cash','partner_direct','owner_direct','loan_direct')),
 amount bigint NOT NULL CHECK(amount>0), partner_id uuid REFERENCES partners(id), lender_party_id uuid REFERENCES parties(id),
 loan_funding_id uuid REFERENCES project_money_entries(id),
 CHECK ((source_type IN ('partner_direct','owner_direct')) = (partner_id IS NOT NULL)),
 CHECK ((source_type='loan_direct') = (lender_party_id IS NOT NULL)),
 CHECK(loan_funding_id IS NULL OR source_type='loan_direct')
);
CREATE TABLE land_costs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id), purchase_id uuid REFERENCES land_purchases(id),
 category text NOT NULL CHECK(category IN ('registration','stamp_duty','broker','legal','other')), amount bigint NOT NULL CHECK(amount>0), paid_on date NOT NULL,
 paid_from text NOT NULL CHECK(paid_from IN ('bank','cash','partner_direct','owner_direct','loan_direct')),
 partner_id uuid REFERENCES partners(id), lender_party_id uuid REFERENCES parties(id), loan_funding_id uuid REFERENCES project_money_entries(id),
 notes text NOT NULL DEFAULT '', voucher_id text NOT NULL UNIQUE REFERENCES journal_vouchers(id),
 status text NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','void')),
 created_by uuid NOT NULL DEFAULT nullif(current_setting('app.actor_id',true),'')::uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((paid_from IN ('partner_direct','owner_direct')) = (partner_id IS NOT NULL)),
 CHECK ((paid_from='loan_direct') = (lender_party_id IS NOT NULL)),
 CHECK(loan_funding_id IS NULL OR paid_from='loan_direct')
);
CREATE TABLE land_contributions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id), parcel_id uuid NOT NULL,
 partner_id uuid NOT NULL REFERENCES partners(id), agreed_value bigint NOT NULL CHECK(agreed_value>0), contributed_on date NOT NULL,
 notes text NOT NULL DEFAULT '', voucher_id text NOT NULL UNIQUE REFERENCES journal_vouchers(id), status text NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','void')),
 created_by uuid NOT NULL DEFAULT nullif(current_setting('app.actor_id',true),'')::uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX land_contribution_active ON land_contributions(project_id,parcel_id) WHERE status='posted';
CREATE INDEX land_payments_purchase ON land_payments(purchase_id);
CREATE INDEX land_sources_payment ON land_payment_sources(payment_id);
CREATE INDEX land_costs_project ON land_costs(project_id);
GRANT SELECT,INSERT ON land_purchases,land_payments,land_payment_sources,land_costs,land_contributions TO baloch_app;
REVOKE UPDATE,DELETE ON land_purchases,land_payments,land_payment_sources,land_costs,land_contributions FROM baloch_app;

CREATE FUNCTION void_land_record(kind text, record_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tab text; voucher text; state text;
BEGIN
 tab=CASE kind WHEN 'purchase' THEN 'land_purchases' WHEN 'payment' THEN 'land_payments' WHEN 'cost' THEN 'land_costs' WHEN 'contribution' THEN 'land_contributions' END;
 IF tab IS NULL THEN RAISE EXCEPTION 'Invalid land record type'; END IF;
 EXECUTE format('SELECT voucher_id,status FROM public.%I WHERE id=$1 FOR UPDATE',tab) INTO voucher,state USING record_id;
 IF state IS DISTINCT FROM 'posted' THEN RAISE EXCEPTION 'Land record is missing or already void' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.journal_vouchers WHERE id=voucher AND status='void')
    OR NOT EXISTS(SELECT 1 FROM public.journal_vouchers WHERE reversal_of=voucher) THEN
   RAISE EXCEPTION 'Reverse the voucher before voiding this record' USING ERRCODE='23514';
 END IF;
 IF kind='purchase' AND (EXISTS(SELECT 1 FROM public.land_payments WHERE purchase_id=record_id AND status='posted') OR EXISTS(SELECT 1 FROM public.land_costs WHERE purchase_id=record_id AND status='posted')) THEN
   RAISE EXCEPTION 'Void posted payments and related costs first' USING ERRCODE='23514';
 END IF;
 EXECUTE format('UPDATE public.%I SET status=''void'' WHERE id=$1',tab) USING record_id;
END $$;
REVOKE ALL ON FUNCTION void_land_record(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION void_land_record(text,uuid) TO baloch_app;

CREATE FUNCTION check_land_payment_sources() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE payment uuid; source_total numeric; journal_total numeric; n bigint;
BEGIN
 payment=CASE WHEN TG_TABLE_NAME='land_payments' THEN NEW.id ELSE NEW.payment_id END;
 SELECT count(*),coalesce(sum(amount),0) INTO n,source_total FROM land_payment_sources WHERE payment_id=payment;
 SELECT coalesce(sum(l.debit),0) INTO journal_total FROM land_payments p JOIN journal_lines l ON l.voucher_id=p.voucher_id WHERE p.id=payment AND l.account_code='2010';
 IF n=0 OR source_total<>journal_total THEN RAISE EXCEPTION 'Payment sources must equal the payment voucher total' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER land_payment_total AFTER INSERT ON land_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_land_payment_sources();
CREATE CONSTRAINT TRIGGER land_source_total AFTER INSERT ON land_payment_sources DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_land_payment_sources();

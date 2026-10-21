CREATE TABLE ledger_entities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('platform','clinic')), clinic_id uuid UNIQUE REFERENCES clinics(id),
 mode text NOT NULL DEFAULT 'sandbox' CHECK(mode='sandbox'), CHECK((kind='clinic')=(clinic_id IS NOT NULL))
);
CREATE UNIQUE INDEX one_platform_ledger ON ledger_entities(kind) WHERE kind='platform';
CREATE TABLE ledger_accounts (
 entity_id uuid REFERENCES ledger_entities(id), code text NOT NULL, name text NOT NULL,
 PRIMARY KEY(entity_id,code)
);
CREATE TABLE accounting_periods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid NOT NULL REFERENCES ledger_entities(id), starts_on date NOT NULL, ends_on date NOT NULL,
 closed_at timestamptz, closed_by uuid REFERENCES users(id), CHECK(ends_on>starts_on),
 EXCLUDE USING gist(entity_id WITH =,daterange(starts_on,ends_on,'[)') WITH &&)
);
CREATE TABLE journals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid NOT NULL REFERENCES ledger_entities(id), currency text NOT NULL DEFAULT 'IQD' CHECK(currency='IQD'),
 source_key text NOT NULL, description text NOT NULL, effective_on date NOT NULL DEFAULT CURRENT_DATE,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted')), created_by uuid NOT NULL REFERENCES users(id),
 approved_by uuid REFERENCES users(id), posted_at timestamptz, reversal_of uuid REFERENCES journals(id), UNIQUE(entity_id,source_key), UNIQUE(id,entity_id)
);
CREATE UNIQUE INDEX one_full_reversal ON journals(reversal_of) WHERE reversal_of IS NOT NULL;
CREATE TABLE journal_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL, entity_id uuid NOT NULL, account_code text NOT NULL,
 debit bigint NOT NULL DEFAULT 0 CHECK(debit>=0), credit bigint NOT NULL DEFAULT 0 CHECK(credit>=0), party_id uuid,
 CHECK((debit>0 AND credit=0) OR (credit>0 AND debit=0)),
 FOREIGN KEY(journal_id,entity_id) REFERENCES journals(id,entity_id), FOREIGN KEY(entity_id,account_code) REFERENCES ledger_accounts(entity_id,code)
);
CREATE FUNCTION guard_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.status='posted' THEN RAISE EXCEPTION 'Posted journal is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER journal_immutable BEFORE UPDATE OR DELETE ON journals FOR EACH ROW EXECUTE FUNCTION guard_journal();
CREATE FUNCTION guard_journal_line() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE state text; BEGIN
 SELECT status INTO state FROM journals WHERE id=COALESCE(NEW.journal_id,OLD.journal_id) FOR UPDATE;
 IF state='posted' THEN RAISE EXCEPTION 'Posted journal line is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND (NEW.journal_id IS DISTINCT FROM OLD.journal_id OR NEW.entity_id IS DISTINCT FROM OLD.entity_id) THEN RAISE EXCEPTION 'Cannot move journal lines'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER journal_line_immutable BEFORE INSERT OR UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION guard_journal_line();
CREATE FUNCTION verify_journal() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid; state text; entity uuid; effective date; amount numeric; n integer; BEGIN
 IF TG_TABLE_NAME='journals' THEN target=NEW.id; ELSE target=COALESCE(NEW.journal_id,OLD.journal_id); END IF;
 SELECT status,entity_id,effective_on INTO state,entity,effective FROM journals WHERE id=target;
 IF state='posted' THEN
  SELECT COALESCE(sum(debit-credit),0),count(*) INTO amount,n FROM journal_lines WHERE journal_id=target;
  IF amount<>0 OR n<2 THEN RAISE EXCEPTION 'Journal must balance' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM accounting_periods WHERE entity_id=entity AND starts_on<=effective AND ends_on>effective AND closed_at IS NOT NULL) THEN RAISE EXCEPTION 'Accounting period closed' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_balance AFTER INSERT OR UPDATE ON journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_journal();
CREATE CONSTRAINT TRIGGER lines_balance AFTER INSERT OR UPDATE OR DELETE ON journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_journal();
CREATE TABLE vendors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinic_id uuid NOT NULL REFERENCES clinics(id),name text NOT NULL,contact text NOT NULL DEFAULT '',UNIQUE(id,clinic_id));
CREATE TABLE products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id), sku text NOT NULL, name text NOT NULL, description text NOT NULL DEFAULT '', species text NOT NULL DEFAULT 'all',
 price_minor bigint NOT NULL CHECK(price_minor>=0), cost_minor bigint NOT NULL CHECK(cost_minor>=0), on_hand integer NOT NULL DEFAULT 0, reserved integer NOT NULL DEFAULT 0,
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1, CHECK(on_hand>=reserved AND reserved>=0), UNIQUE(clinic_id,sku), UNIQUE(id,clinic_id)
);
CREATE TABLE purchase_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinic_id uuid NOT NULL REFERENCES clinics(id),vendor_id uuid NOT NULL,product_id uuid NOT NULL,quantity integer NOT NULL CHECK(quantity>0),
 unit_cost bigint NOT NULL CHECK(unit_cost>=0),status text NOT NULL DEFAULT 'ordered' CHECK(status IN ('ordered','received','billed','paid')),created_by uuid NOT NULL REFERENCES users(id),
 FOREIGN KEY(vendor_id,clinic_id) REFERENCES vendors(id,clinic_id),FOREIGN KEY(product_id,clinic_id) REFERENCES products(id,clinic_id)
);
CREATE TABLE stock_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid NOT NULL REFERENCES products(id),clinic_id uuid NOT NULL REFERENCES clinics(id),quantity integer NOT NULL CHECK(quantity<>0),
 kind text NOT NULL CHECK(kind IN ('receipt','sale','return','adjustment')),source_key text NOT NULL UNIQUE,actor_id uuid NOT NULL REFERENCES users(id),occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER stock_immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION protect_addendum();
CREATE TABLE checkout_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),idempotency_key uuid NOT NULL,request_hash text NOT NULL,
 mode text NOT NULL DEFAULT 'sandbox' CHECK(mode='sandbox'),status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','captured','cancelled','expired')),
 total_minor bigint NOT NULL CHECK(total_minor>=0),address text NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '20 minutes',created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,idempotency_key)
);
CREATE TABLE clinic_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),parent_id uuid NOT NULL REFERENCES checkout_orders(id),clinic_id uuid NOT NULL REFERENCES clinics(id),
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','confirmed','packed','shipped','delivered','returned','cancelled')),total_minor bigint NOT NULL,commission_minor bigint NOT NULL DEFAULT 0,
 UNIQUE(id,clinic_id)
);
CREATE TABLE order_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL,clinic_id uuid NOT NULL,product_id uuid NOT NULL,name text NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0),returned_quantity integer NOT NULL DEFAULT 0,unit_price bigint NOT NULL CHECK(unit_price>=0),unit_cost bigint NOT NULL CHECK(unit_cost>=0),
 CHECK(returned_quantity BETWEEN 0 AND quantity),FOREIGN KEY(order_id,clinic_id) REFERENCES clinic_orders(id,clinic_id),FOREIGN KEY(product_id,clinic_id) REFERENCES products(id,clinic_id)
);
CREATE TABLE sandbox_captures(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL UNIQUE REFERENCES checkout_orders(id),event_key uuid NOT NULL UNIQUE,captured_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE return_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),line_id uuid NOT NULL REFERENCES order_lines(id),user_id uuid NOT NULL REFERENCES users(id),quantity integer NOT NULL CHECK(quantity>0),
 reason text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),reviewed_by uuid REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE finance_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinic_id uuid NOT NULL REFERENCES clinics(id),kind text NOT NULL CHECK(kind IN ('vendor_payment','reversal','manual_post')),
 source_id uuid NOT NULL,created_by uuid NOT NULL REFERENCES users(id),reason text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reviewed_by uuid REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(kind,source_id)
);
CREATE TABLE sandbox_policy (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),commission_bps integer NOT NULL DEFAULT 0 CHECK(commission_bps BETWEEN 0 AND 3000));
INSERT INTO sandbox_policy(singleton) VALUES(true);
CREATE TABLE inventory_layers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid NOT NULL REFERENCES products(id),remaining integer NOT NULL CHECK(remaining>=0),unit_cost bigint NOT NULL CHECK(unit_cost>=0),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE order_lines ADD COLUMN cost_total bigint NOT NULL DEFAULT 0 CHECK(cost_total>=0);
CREATE TABLE inventory_allocations(line_id uuid REFERENCES order_lines(id),layer_id uuid REFERENCES inventory_layers(id),quantity integer NOT NULL CHECK(quantity>0),unit_cost bigint NOT NULL,PRIMARY KEY(line_id,layer_id));

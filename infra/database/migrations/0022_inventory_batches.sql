CREATE TABLE warehouses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinic_id uuid NOT NULL REFERENCES clinics(id),branch_id uuid REFERENCES clinic_branches(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),is_primary boolean NOT NULL DEFAULT false,UNIQUE(id,clinic_id)
);
CREATE UNIQUE INDEX warehouse_primary ON warehouses(clinic_id) WHERE is_primary;
INSERT INTO warehouses(clinic_id,name,is_primary) SELECT id,'المستودع الرئيسي',true FROM clinics;
CREATE FUNCTION create_primary_warehouse() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO warehouses(clinic_id,name,is_primary) VALUES(NEW.id,'المستودع الرئيسي',true); RETURN NEW; END; $$;
CREATE TRIGGER clinic_default_warehouse AFTER INSERT ON clinics FOR EACH ROW EXECUTE FUNCTION create_primary_warehouse();
CREATE FUNCTION guard_warehouse_branch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM clinic_branches WHERE id=NEW.branch_id AND clinic_id=NEW.clinic_id) THEN
 RAISE EXCEPTION 'Warehouse branch outside clinic' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER warehouse_branch_scope BEFORE INSERT OR UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION guard_warehouse_branch();
ALTER TABLE inventory_layers ADD COLUMN clinic_id uuid REFERENCES clinics(id),ADD COLUMN warehouse_id uuid,
 ADD COLUMN batch_code text NOT NULL DEFAULT '',ADD COLUMN expires_on date,ADD COLUMN quarantined boolean NOT NULL DEFAULT false;
UPDATE inventory_layers l SET clinic_id=p.clinic_id,warehouse_id=w.id FROM products p JOIN warehouses w ON w.clinic_id=p.clinic_id AND w.is_primary WHERE p.id=l.product_id;
ALTER TABLE inventory_layers ALTER COLUMN clinic_id SET NOT NULL,ALTER COLUMN warehouse_id SET NOT NULL,
 ADD FOREIGN KEY(product_id,clinic_id) REFERENCES products(id,clinic_id),ADD FOREIGN KEY(warehouse_id,clinic_id) REFERENCES warehouses(id,clinic_id);
CREATE FUNCTION layer_defaults() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 SELECT clinic_id INTO NEW.clinic_id FROM products WHERE id=NEW.product_id;
 IF NEW.warehouse_id IS NULL THEN SELECT id INTO NEW.warehouse_id FROM warehouses WHERE clinic_id=NEW.clinic_id AND is_primary; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER layer_default_scope BEFORE INSERT ON inventory_layers FOR EACH ROW EXECUTE FUNCTION layer_defaults();
CREATE FUNCTION eligible_stock(pid uuid) RETURNS integer LANGUAGE sql STABLE AS $$
 SELECT coalesce(sum(remaining),0)::integer FROM inventory_layers WHERE product_id=pid AND NOT quarantined AND (expires_on IS NULL OR expires_on>=(now() AT TIME ZONE 'Asia/Baghdad')::date);
$$;
CREATE FUNCTION available_stock(pid uuid) RETURNS integer LANGUAGE sql STABLE AS $$
 SELECT greatest(0,eligible_stock(pid)-reserved) FROM products WHERE id=pid;
$$;
CREATE INDEX layer_available ON inventory_layers(product_id,created_at,id) WHERE remaining>0 AND NOT quarantined;
ALTER TABLE purchase_orders ADD COLUMN received_quantity integer NOT NULL DEFAULT 0 CHECK(received_quantity BETWEEN 0 AND quantity),
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN due_on date NOT NULL DEFAULT (CURRENT_DATE+30),ADD COLUMN paid_minor bigint NOT NULL DEFAULT 0 CHECK(paid_minor>=0 AND paid_minor<=quantity*unit_cost);
UPDATE purchase_orders SET received_quantity=CASE WHEN status='ordered' THEN 0 ELSE quantity END,paid_minor=CASE WHEN status='paid' THEN quantity*unit_cost ELSE 0 END;
CREATE TABLE purchase_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),po_id uuid NOT NULL REFERENCES purchase_orders(id),clinic_id uuid NOT NULL REFERENCES clinics(id),
 quantity integer NOT NULL CHECK(quantity>0),warehouse_id uuid NOT NULL,layer_id uuid NOT NULL REFERENCES inventory_layers(id),idempotency_key uuid NOT NULL,request_hash text NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(po_id,idempotency_key),FOREIGN KEY(warehouse_id,clinic_id) REFERENCES warehouses(id,clinic_id)
);
CREATE TRIGGER receipt_immutable BEFORE UPDATE OR DELETE ON purchase_receipts FOR EACH ROW EXECUTE FUNCTION protect_addendum();
CREATE TABLE inventory_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinic_id uuid NOT NULL REFERENCES clinics(id),layer_id uuid NOT NULL REFERENCES inventory_layers(id),
 quantity integer NOT NULL CHECK(quantity>0),reason text NOT NULL,created_by uuid NOT NULL REFERENCES users(id),approved_by uuid REFERENCES users(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),idempotency_key uuid NOT NULL,request_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),CHECK(approved_by IS NULL OR approved_by<>created_by),UNIQUE(clinic_id,created_by,idempotency_key)
);
CREATE TABLE inventory_transfers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinic_id uuid NOT NULL REFERENCES clinics(id),source_layer uuid NOT NULL REFERENCES inventory_layers(id),target_layer uuid NOT NULL REFERENCES inventory_layers(id),
 quantity integer NOT NULL CHECK(quantity>0),created_by uuid NOT NULL REFERENCES users(id),idempotency_key uuid NOT NULL,request_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(clinic_id,created_by,idempotency_key)
);
CREATE TRIGGER transfer_immutable BEFORE UPDATE OR DELETE ON inventory_transfers FOR EACH ROW EXECUTE FUNCTION protect_addendum();
ALTER TABLE finance_approvals ADD COLUMN amount_minor bigint CHECK(amount_minor>0);
CREATE TABLE vendor_payments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),po_id uuid NOT NULL REFERENCES purchase_orders(id),clinic_id uuid NOT NULL REFERENCES clinics(id),amount_minor bigint NOT NULL CHECK(amount_minor>0),
 journal_id uuid NOT NULL UNIQUE REFERENCES journals(id),approval_id uuid UNIQUE REFERENCES finance_approvals(id),paid_on date NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO vendor_payments(po_id,clinic_id,amount_minor,journal_id,paid_on)
 SELECT p.id,p.clinic_id,p.quantity*p.unit_cost,j.id,j.effective_on FROM purchase_orders p JOIN ledger_entities e ON e.clinic_id=p.clinic_id JOIN journals j ON j.entity_id=e.id AND j.source_key='vendor-paid:'||p.id::text AND j.status='posted' WHERE p.status='paid' AND p.unit_cost>0;
CREATE TRIGGER vendor_payment_immutable BEFORE UPDATE OR DELETE ON vendor_payments FOR EACH ROW EXECUTE FUNCTION protect_addendum();

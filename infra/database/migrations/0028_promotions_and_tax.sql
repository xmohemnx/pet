CREATE TABLE commerce_tax_settings (
 id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,clinic_id uuid PRIMARY KEY REFERENCES clinics(id),rate_bps integer NOT NULL CHECK(rate_bps BETWEEN 0 AND 10000),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 100),version integer NOT NULL DEFAULT 1 CHECK(version>0),updated_by uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE commerce_coupons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinic_id uuid NOT NULL REFERENCES clinics(id),code text NOT NULL CHECK(code ~ '^[A-Z0-9_-]{3,32}$'),
 kind text NOT NULL CHECK(kind IN ('fixed','percent')),value bigint NOT NULL CHECK(value>0),minimum_minor bigint NOT NULL DEFAULT 0 CHECK(minimum_minor>=0),
 maximum_discount_minor bigint CHECK(maximum_discount_minor>0),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 max_uses integer NOT NULL CHECK(max_uses BETWEEN 1 AND 100000),max_per_user integer NOT NULL CHECK(max_per_user BETWEEN 1 AND 100),
 active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(kind<>'percent' OR value<=10000),UNIQUE(clinic_id,code),UNIQUE(id,clinic_id)
);
CREATE FUNCTION guard_coupon_terms() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['active','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['active','version']) OR NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'Coupon terms are immutable; create a new code' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER coupon_terms_immutable BEFORE UPDATE OR DELETE ON commerce_coupons FOR EACH ROW EXECUTE FUNCTION guard_coupon_terms();
ALTER TABLE checkout_orders ADD COLUMN subtotal_minor bigint,ADD COLUMN discount_minor bigint NOT NULL DEFAULT 0,ADD COLUMN tax_minor bigint NOT NULL DEFAULT 0,ADD COLUMN quote_hash text;
UPDATE checkout_orders SET subtotal_minor=total_minor;
ALTER TABLE checkout_orders ALTER COLUMN subtotal_minor SET NOT NULL;
ALTER TABLE checkout_orders ADD CHECK(subtotal_minor>=0 AND discount_minor BETWEEN 0 AND subtotal_minor AND tax_minor>=0 AND total_minor=subtotal_minor-discount_minor+tax_minor);
ALTER TABLE clinic_orders ADD COLUMN subtotal_minor bigint,ADD COLUMN discount_minor bigint NOT NULL DEFAULT 0,ADD COLUMN tax_minor bigint NOT NULL DEFAULT 0,
 ADD COLUMN tax_bps integer NOT NULL DEFAULT 0 CHECK(tax_bps BETWEEN 0 AND 10000),ADD COLUMN tax_label text NOT NULL DEFAULT '',ADD COLUMN coupon_id uuid,
 ADD COLUMN coupon_code text;
UPDATE clinic_orders SET subtotal_minor=total_minor;
ALTER TABLE clinic_orders ALTER COLUMN subtotal_minor SET NOT NULL;
ALTER TABLE clinic_orders ADD CHECK(subtotal_minor>=0 AND discount_minor BETWEEN 0 AND subtotal_minor AND tax_minor>=0 AND total_minor=subtotal_minor-discount_minor+tax_minor AND commission_minor BETWEEN 0 AND (subtotal_minor-discount_minor));
ALTER TABLE clinic_orders ADD FOREIGN KEY(coupon_id,clinic_id) REFERENCES commerce_coupons(id,clinic_id);
CREATE INDEX coupon_order_usage ON clinic_orders(coupon_id,parent_id) WHERE coupon_id IS NOT NULL;
ALTER TABLE order_lines ADD COLUMN discount_minor bigint NOT NULL DEFAULT 0,ADD COLUMN tax_minor bigint NOT NULL DEFAULT 0,ADD COLUMN tax_bps integer NOT NULL DEFAULT 0 CHECK(tax_bps BETWEEN 0 AND 10000),
 ADD COLUMN total_minor bigint GENERATED ALWAYS AS (unit_price*quantity-discount_minor+tax_minor) STORED;
ALTER TABLE order_lines ADD CHECK(discount_minor BETWEEN 0 AND unit_price*quantity AND tax_minor=floor(((unit_price*quantity-discount_minor)::numeric*tax_bps+5000)/10000));
CREATE FUNCTION guard_order_pricing() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE allowed text[]; BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Order snapshots cannot be deleted' USING ERRCODE='23514'; END IF;
 allowed=CASE TG_TABLE_NAME WHEN 'checkout_orders' THEN ARRAY['status','expires_at'] WHEN 'clinic_orders' THEN ARRAY['status'] ELSE ARRAY['returned_quantity','cost_total','total_minor'] END;
 IF (to_jsonb(NEW)-allowed) IS DISTINCT FROM (to_jsonb(OLD)-allowed) THEN RAISE EXCEPTION 'Order pricing snapshot is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER checkout_snapshot_immutable BEFORE UPDATE OR DELETE ON checkout_orders FOR EACH ROW EXECUTE FUNCTION guard_order_pricing();
CREATE TRIGGER clinic_order_snapshot_immutable BEFORE UPDATE OR DELETE ON clinic_orders FOR EACH ROW EXECUTE FUNCTION guard_order_pricing();
CREATE TRIGGER order_line_snapshot_immutable BEFORE UPDATE OR DELETE ON order_lines FOR EACH ROW EXECUTE FUNCTION guard_order_pricing();
CREATE FUNCTION verify_order_pricing() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE parent uuid; child uuid; BEGIN
 IF TG_TABLE_NAME='checkout_orders' THEN parent=NEW.id;
 ELSIF TG_TABLE_NAME='clinic_orders' THEN parent=NEW.parent_id; child=NEW.id;
 ELSE child=NEW.order_id; SELECT parent_id INTO parent FROM clinic_orders WHERE id=child; END IF;
 IF EXISTS(SELECT 1 FROM checkout_orders o WHERE o.id=parent AND (o.subtotal_minor,o.discount_minor,o.tax_minor,o.total_minor) IS DISTINCT FROM
  (SELECT ROW(coalesce(sum(c.subtotal_minor),0)::bigint,coalesce(sum(c.discount_minor),0)::bigint,coalesce(sum(c.tax_minor),0)::bigint,coalesce(sum(c.total_minor),0)::bigint) FROM clinic_orders c WHERE c.parent_id=o.id)) THEN
  RAISE EXCEPTION 'Parent pricing totals do not match' USING ERRCODE='23514'; END IF;
 IF child IS NOT NULL AND EXISTS(SELECT 1 FROM clinic_orders c WHERE c.id=child AND (c.subtotal_minor,c.discount_minor,c.tax_minor,c.total_minor) IS DISTINCT FROM
  (SELECT ROW(coalesce(sum(l.unit_price*l.quantity),0)::bigint,coalesce(sum(l.discount_minor),0)::bigint,coalesce(sum(l.tax_minor),0)::bigint,coalesce(sum(l.total_minor),0)::bigint) FROM order_lines l WHERE l.order_id=c.id)) THEN
  RAISE EXCEPTION 'Line pricing totals do not match' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER checkout_price_balance AFTER INSERT ON checkout_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_order_pricing();
CREATE CONSTRAINT TRIGGER clinic_order_price_balance AFTER INSERT ON clinic_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_order_pricing();
CREATE CONSTRAINT TRIGGER line_price_balance AFTER INSERT ON order_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_order_pricing();

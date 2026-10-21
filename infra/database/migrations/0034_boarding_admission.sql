ALTER TABLE boarding_units ADD COLUMN max_weight_grams integer CHECK(max_weight_grams BETWEEN 1 AND 2000000), ADD COLUMN vaccines_required boolean NOT NULL DEFAULT false, ADD COLUMN health_requirements text NOT NULL DEFAULT '' CHECK(length(health_requirements)<=1500), ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
CREATE FUNCTION protect_boarding_unit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'boarding units are retained'; END IF;
 IF (to_jsonb(NEW)-ARRAY['active','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['active','version']) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'boarding terms are immutable'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER boarding_unit_immutable BEFORE UPDATE OR DELETE ON boarding_units FOR EACH ROW EXECUTE FUNCTION protect_boarding_unit();

ALTER TABLE boarding_bookings ADD COLUMN unit_name text, ADD COLUMN pet_name text, ADD COLUMN night_price bigint, ADD COLUMN max_weight_grams integer, ADD COLUMN vaccines_required boolean NOT NULL DEFAULT false, ADD COLUMN health_requirements text NOT NULL DEFAULT '', ADD COLUMN policy_accepted boolean NOT NULL DEFAULT false, ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0), ADD COLUMN checked_in_at timestamptz, ADD COLUMN checked_out_at timestamptz, ADD COLUMN review_id uuid;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM boarding_bookings WHERE total_minor % (ends_on-starts_on)<>0) THEN RAISE EXCEPTION 'legacy nightly price requires reconciliation'; END IF; END $$;
UPDATE boarding_bookings b SET unit_name=u.name,pet_name=p.name,night_price=b.total_minor/(b.ends_on-b.starts_on),max_weight_grams=u.max_weight_grams,vaccines_required=u.vaccines_required,health_requirements=u.health_requirements FROM boarding_units u,pets p WHERE u.id=b.unit_id AND p.id=b.pet_id;
ALTER TABLE boarding_bookings ALTER COLUMN unit_name SET NOT NULL, ALTER COLUMN pet_name SET NOT NULL, ALTER COLUMN night_price SET NOT NULL;
-- Historical prices remain intact; new contracts use the current immutable unit rate.
ALTER TABLE boarding_bookings ADD CONSTRAINT boarding_night_price_positive CHECK(night_price>0), ADD CONSTRAINT boarding_booking_scope UNIQUE(id,unit_id,pet_id,user_id), ADD CONSTRAINT boarding_pet_capacity EXCLUDE USING gist(pet_id WITH =,daterange(starts_on,ends_on,'[)') WITH &&) WHERE(status IN ('confirmed','checked_in'));
CREATE TABLE boarding_admission_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid NOT NULL REFERENCES boarding_bookings(id),doctor_id uuid NOT NULL REFERENCES users(id),decision text NOT NULL CHECK(decision IN ('approved','rejected')),weight_grams integer NOT NULL CHECK(weight_grams BETWEEN 1 AND 2000000),vaccines_checked boolean NOT NULL,valid_through date NOT NULL,notes text NOT NULL CHECK(length(notes) BETWEEN 5 AND 2000),idempotency_key uuid NOT NULL,request_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,booking_id),UNIQUE(booking_id,doctor_id,idempotency_key));
ALTER TABLE boarding_bookings ADD CONSTRAINT boarding_review_scope FOREIGN KEY(review_id,id) REFERENCES boarding_admission_reviews(id,booking_id);
CREATE TRIGGER boarding_review_immutable BEFORE UPDATE OR DELETE ON boarding_admission_reviews FOR EACH ROW EXECUTE FUNCTION protect_addendum();
CREATE TABLE boarding_incident_log(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid NOT NULL REFERENCES boarding_bookings(id),actor_id uuid NOT NULL REFERENCES users(id),kind text NOT NULL CHECK(kind IN ('incident','resolution')),severity text NOT NULL CHECK(severity IN ('low','attention','urgent')),body text NOT NULL CHECK(length(body) BETWEEN 5 AND 2000),resolves_id uuid UNIQUE,idempotency_key uuid NOT NULL,request_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,booking_id),UNIQUE(booking_id,actor_id,idempotency_key),CHECK((kind='resolution')=(resolves_id IS NOT NULL)),FOREIGN KEY(resolves_id,booking_id) REFERENCES boarding_incident_log(id,booking_id));
CREATE TRIGGER boarding_log_immutable BEFORE UPDATE OR DELETE ON boarding_incident_log FOR EACH ROW EXECUTE FUNCTION protect_addendum();
CREATE FUNCTION guard_boarding_log() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM boarding_bookings WHERE id=NEW.booking_id AND status='checked_in') THEN RAISE EXCEPTION 'incident requires active stay'; END IF;
 IF NEW.kind='resolution' AND NOT EXISTS(SELECT 1 FROM boarding_incident_log WHERE id=NEW.resolves_id AND booking_id=NEW.booking_id AND kind='incident' AND severity=NEW.severity) THEN RAISE EXCEPTION 'invalid resolution'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER boarding_log_scope BEFORE INSERT ON boarding_incident_log FOR EACH ROW EXECUTE FUNCTION guard_boarding_log();
CREATE FUNCTION guard_boarding_booking() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'boarding contracts are retained'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.total_minor<>NEW.night_price*(NEW.ends_on-NEW.starts_on) OR NOT NEW.policy_accepted THEN RAISE EXCEPTION 'invalid boarding contract'; END IF;
  RETURN NEW;
 END IF;
 IF (to_jsonb(NEW)-ARRAY['status','version','review_id','policy_accepted','checked_in_at','checked_out_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','review_id','policy_accepted','checked_in_at','checked_out_at']) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'boarding contract is immutable'; END IF;
 IF OLD.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'closed boarding contract'; END IF;
 IF OLD.policy_accepted AND NOT NEW.policy_accepted THEN RAISE EXCEPTION 'contract acceptance is retained'; END IF;
 IF NEW.review_id IS DISTINCT FROM OLD.review_id AND OLD.status<>'confirmed' THEN RAISE EXCEPTION 'review after admission'; END IF;
 IF NEW.status<>OLD.status AND NOT ((OLD.status='confirmed' AND NEW.status IN ('checked_in','cancelled')) OR (OLD.status='checked_in' AND NEW.status='completed')) THEN RAISE EXCEPTION 'invalid boarding transition'; END IF;
 IF NEW.status='checked_in' AND OLD.status='confirmed' THEN
  IF NOT NEW.policy_accepted OR NEW.checked_in_at IS NULL OR NOT EXISTS(SELECT 1 FROM boarding_admission_reviews r WHERE r.id=NEW.review_id AND r.booking_id=NEW.id AND r.decision='approved' AND r.valid_through>=NEW.ends_on AND (NEW.max_weight_grams IS NULL OR r.weight_grams<=NEW.max_weight_grams) AND (NOT NEW.vaccines_required OR r.vaccines_checked)) THEN RAISE EXCEPTION 'boarding admission missing'; END IF;
 END IF;
 IF NEW.status='completed' THEN
  IF NEW.checked_out_at IS NULL OR EXISTS(SELECT 1 FROM boarding_incident_log i WHERE i.booking_id=NEW.id AND i.kind='incident' AND i.severity='urgent' AND NOT EXISTS(SELECT 1 FROM boarding_incident_log r WHERE r.resolves_id=i.id)) THEN RAISE EXCEPTION 'urgent incident remains open'; END IF;
 END IF;
 RETURN NEW; END $$;
CREATE TRIGGER boarding_booking_immutable BEFORE INSERT OR UPDATE OR DELETE ON boarding_bookings FOR EACH ROW EXECUTE FUNCTION guard_boarding_booking();
CREATE INDEX boarding_review_booking_time ON boarding_admission_reviews(booking_id,created_at DESC);
CREATE INDEX boarding_log_booking_time ON boarding_incident_log(booking_id,created_at,id);
CREATE INDEX boarding_booking_owner_time ON boarding_bookings(user_id,created_at DESC);

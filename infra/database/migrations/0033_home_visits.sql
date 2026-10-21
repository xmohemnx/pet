CREATE TABLE home_visit_offers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinic_id uuid NOT NULL REFERENCES clinics(id),branch_id uuid NOT NULL,service_id uuid NOT NULL,doctor_id uuid NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 2 AND 100),description text NOT NULL CHECK(length(description)<=1500),city text NOT NULL CHECK(length(city) BETWEEN 2 AND 100),district text NOT NULL CHECK(length(district) BETWEEN 2 AND 100),
 species text[] NOT NULL CHECK(cardinality(species) BETWEEN 1 AND 5 AND species <@ ARRAY['cat','dog','bird','rabbit','other']::text[]),
 service_minor bigint NOT NULL CHECK(service_minor>=0),travel_minor bigint NOT NULL CHECK(travel_minor>=0),total_minor bigint GENERATED ALWAYS AS(service_minor+travel_minor) STORED CHECK(total_minor BETWEEN 1 AND 999999999999),
 duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 15 AND 180),buffer_minutes integer NOT NULL CHECK(buffer_minutes BETWEEN 0 AND 60),travel_minutes integer NOT NULL CHECK(travel_minutes BETWEEN 5 AND 120),
 active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(branch_id,clinic_id) REFERENCES clinic_branches(id,clinic_id),FOREIGN KEY(service_id,clinic_id) REFERENCES clinic_services(id,clinic_id),FOREIGN KEY(doctor_id,clinic_id) REFERENCES clinic_memberships(user_id,clinic_id),
 UNIQUE(id,clinic_id,branch_id,service_id,doctor_id)
);
CREATE FUNCTION guard_home_offer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['active','version','total_minor']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['active','version','total_minor']) THEN RAISE EXCEPTION 'Home visit terms are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER home_offer_immutable BEFORE UPDATE OR DELETE ON home_visit_offers FOR EACH ROW EXECUTE FUNCTION guard_home_offer();
ALTER TABLE appointment_slots ADD COLUMN visit_mode text NOT NULL DEFAULT 'clinic' CHECK(visit_mode IN ('clinic','home')),ADD COLUMN home_offer_id uuid,
 ADD CHECK((visit_mode='home')=(home_offer_id IS NOT NULL)),ADD UNIQUE(id,visit_mode),
 ADD FOREIGN KEY(home_offer_id,clinic_id,branch_id,service_id,doctor_id) REFERENCES home_visit_offers(id,clinic_id,branch_id,service_id,doctor_id);
CREATE FUNCTION guard_home_slot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (OLD.visit_mode='home' OR NEW.visit_mode='home') AND (to_jsonb(NEW)-'cancelled_at') IS DISTINCT FROM (to_jsonb(OLD)-'cancelled_at') THEN RAISE EXCEPTION 'Home slot terms are immutable' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER home_slot_immutable BEFORE UPDATE ON appointment_slots FOR EACH ROW EXECUTE FUNCTION guard_home_slot();
ALTER TABLE appointments ADD COLUMN visit_mode text NOT NULL DEFAULT 'clinic' CHECK(visit_mode IN ('clinic','home')),ADD COLUMN occupied_from timestamptz;
UPDATE appointments SET occupied_from=starts_at;
ALTER TABLE appointments ALTER COLUMN occupied_from SET NOT NULL,ADD CHECK(occupied_from<=starts_at),
 ADD FOREIGN KEY(slot_id,visit_mode) REFERENCES appointment_slots(id,visit_mode),ADD UNIQUE(id,clinic_id,doctor_id,pet_id,requester_id);
CREATE OR REPLACE FUNCTION appointment_occupied_range() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN NEW.occupied_until:=COALESCE(NEW.occupied_until,NEW.ends_at);NEW.occupied_from:=COALESCE(NEW.occupied_from,NEW.starts_at);
 ELSE
  IF NEW.ends_at IS DISTINCT FROM OLD.ends_at AND NEW.occupied_until=OLD.occupied_until THEN NEW.occupied_until:=NEW.ends_at+(OLD.occupied_until-OLD.ends_at);END IF;
  IF NEW.starts_at IS DISTINCT FROM OLD.starts_at AND NEW.occupied_from=OLD.occupied_from THEN NEW.occupied_from:=NEW.starts_at-(OLD.starts_at-OLD.occupied_from);END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER TABLE appointments DROP CONSTRAINT doctor_occupied_exclusion,DROP CONSTRAINT resource_occupied_exclusion;
ALTER TABLE appointments ADD CONSTRAINT doctor_occupied_exclusion EXCLUDE USING gist(doctor_id WITH =,tstzrange(occupied_from,occupied_until,'[)') WITH &&) WHERE(status='confirmed');
ALTER TABLE appointments ADD CONSTRAINT resource_occupied_exclusion EXCLUDE USING gist(resource_id WITH =,tstzrange(occupied_from,occupied_until,'[)') WITH &&) WHERE(status='confirmed' AND resource_id IS NOT NULL);
CREATE OR REPLACE FUNCTION sync_booking_occupancy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Booking history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='appointments' THEN
  INSERT INTO clinic_booking_occupancy VALUES('appointment',NEW.id,NEW.doctor_id,NEW.pet_id,NEW.resource_id,NEW.occupied_from,NEW.occupied_until,NEW.status='confirmed')
  ON CONFLICT(source_kind,source_id) DO UPDATE SET staff_id=excluded.staff_id,pet_id=excluded.pet_id,resource_id=excluded.resource_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,active=excluded.active;
 ELSE
  INSERT INTO clinic_booking_occupancy VALUES('grooming',NEW.id,NEW.staff_id,NEW.pet_id,NEW.resource_id,NEW.starts_at,NEW.ends_at,NEW.status IN ('confirmed','in_progress'))
  ON CONFLICT(source_kind,source_id) DO UPDATE SET active=excluded.active;
 END IF;
 RETURN NEW;
END $$;
CREATE TABLE home_visit_bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),appointment_id uuid NOT NULL UNIQUE,offer_id uuid NOT NULL REFERENCES home_visit_offers(id),clinic_id uuid NOT NULL,doctor_id uuid NOT NULL,pet_id uuid NOT NULL,user_id uuid NOT NULL,
 pet_name text NOT NULL,service_name text NOT NULL,city text NOT NULL,district text NOT NULL,service_minor bigint NOT NULL CHECK(service_minor>=0),travel_minor bigint NOT NULL CHECK(travel_minor>=0),total_minor bigint GENERATED ALWAYS AS(service_minor+travel_minor) STORED CHECK(total_minor>0),
 contact_name text NOT NULL CHECK(length(contact_name) BETWEEN 2 AND 100),phone text NOT NULL CHECK(length(phone) BETWEEN 7 AND 24),address_line text NOT NULL CHECK(length(address_line) BETWEEN 5 AND 500),notes text NOT NULL CHECK(length(notes)<=1000),
 address_consent boolean NOT NULL CHECK(address_consent),medical_consent_until timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','en_route','arrived','completed','cancelled')),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 departed_at timestamptz,arrived_at timestamptz,completed_at timestamptz,cancelled_at timestamptz,idempotency_key uuid NOT NULL,request_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(appointment_id,clinic_id,doctor_id,pet_id,user_id) REFERENCES appointments(id,clinic_id,doctor_id,pet_id,requester_id),UNIQUE(user_id,idempotency_key)
);
CREATE FUNCTION guard_home_booking() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.status IN ('cancelled','completed') OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['status','version','departed_at','arrived_at','completed_at','cancelled_at','total_minor']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','departed_at','arrived_at','completed_at','cancelled_at','total_minor']) THEN RAISE EXCEPTION 'Home visit snapshot is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.status<>OLD.status AND NOT ((OLD.status='confirmed' AND NEW.status IN ('en_route','cancelled')) OR (OLD.status='en_route' AND NEW.status IN ('arrived','cancelled')) OR (OLD.status='arrived' AND NEW.status IN ('completed','cancelled'))) THEN RAISE EXCEPTION 'Invalid home visit transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER home_booking_immutable BEFORE UPDATE OR DELETE ON home_visit_bookings FOR EACH ROW EXECUTE FUNCTION guard_home_booking();
CREATE TABLE home_visit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid NOT NULL REFERENCES home_visit_bookings(id),actor_id uuid NOT NULL REFERENCES users(id),state text NOT NULL CHECK(state IN ('confirmed','en_route','arrived','completed','cancelled')),occurred_at timestamptz NOT NULL DEFAULT now(),UNIQUE(booking_id,state)
);
CREATE TRIGGER home_events_immutable BEFORE UPDATE OR DELETE ON home_visit_events FOR EACH ROW EXECUTE FUNCTION protect_addendum();
CREATE INDEX home_bookings_clinic ON home_visit_bookings(clinic_id,created_at DESC);
CREATE INDEX home_bookings_owner ON home_visit_bookings(user_id,created_at DESC);
CREATE INDEX home_bookings_doctor ON home_visit_bookings(doctor_id,created_at DESC);
CREATE INDEX home_events_booking ON home_visit_events(booking_id,occurred_at);
CREATE FUNCTION check_home_visit_link() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid; BEGIN
 IF TG_TABLE_NAME='appointments' THEN target:=NEW.id;ELSE target:=NEW.appointment_id;END IF;
 IF EXISTS(SELECT 1 FROM appointments a LEFT JOIN home_visit_bookings h ON h.appointment_id=a.id JOIN appointment_slots sl ON sl.id=a.slot_id LEFT JOIN home_visit_offers o ON o.id=h.offer_id WHERE a.id=target AND ((a.visit_mode<>'home' AND h.id IS NOT NULL) OR (a.visit_mode='home' AND (h.id IS NULL OR h.offer_id<>sl.home_offer_id OR h.service_minor<>o.service_minor OR h.travel_minor<>o.travel_minor OR a.doctor_id<>sl.doctor_id OR a.clinic_id<>sl.clinic_id OR (h.status='cancelled')<>(a.status='cancelled') OR (h.status='completed')<>(a.status='completed') OR a.status='no_show' OR (h.status='completed' AND NOT EXISTS(SELECT 1 FROM encounters e WHERE e.appointment_id=a.id AND e.signed_at IS NOT NULL)))))) THEN RAISE EXCEPTION 'Home visit and clinical appointment must agree' USING ERRCODE='23514';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER home_appointment_link AFTER INSERT OR UPDATE ON appointments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_home_visit_link();
CREATE CONSTRAINT TRIGGER home_booking_link AFTER INSERT OR UPDATE ON home_visit_bookings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_home_visit_link();

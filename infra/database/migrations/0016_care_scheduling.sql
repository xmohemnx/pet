ALTER TABLE clinic_branches ADD CONSTRAINT clinic_branch_scope UNIQUE(id,clinic_id);
ALTER TABLE clinic_services ADD COLUMN buffer_minutes integer NOT NULL DEFAULT 0 CHECK(buffer_minutes BETWEEN 0 AND 60);
ALTER TABLE clinic_services ADD COLUMN price_minor bigint NOT NULL DEFAULT 0 CHECK(price_minor>=0);
ALTER TABLE clinic_services ADD COLUMN requires_resource boolean NOT NULL DEFAULT false;
CREATE TABLE clinic_resources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinic_id uuid NOT NULL REFERENCES clinics(id),branch_id uuid NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),active boolean NOT NULL DEFAULT true,
 FOREIGN KEY(branch_id,clinic_id) REFERENCES clinic_branches(id,clinic_id),UNIQUE(id,clinic_id,branch_id),UNIQUE(id,clinic_id),UNIQUE(branch_id,name)
);
ALTER TABLE appointment_slots ADD COLUMN resource_id uuid;
ALTER TABLE appointment_slots ADD COLUMN buffer_minutes integer NOT NULL DEFAULT 0 CHECK(buffer_minutes BETWEEN 0 AND 60);
ALTER TABLE appointment_slots ADD CONSTRAINT slot_resource_scope FOREIGN KEY(resource_id,clinic_id,branch_id) REFERENCES clinic_resources(id,clinic_id,branch_id);
CREATE TABLE doctor_working_hours (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),doctor_id uuid NOT NULL REFERENCES users(id),clinic_id uuid NOT NULL REFERENCES clinics(id),
 branch_id uuid NOT NULL,service_id uuid NOT NULL,resource_id uuid,
 weekday integer NOT NULL CHECK(weekday BETWEEN 0 AND 6),start_minute integer NOT NULL CHECK(start_minute BETWEEN 0 AND 1439),
 end_minute integer NOT NULL CHECK(end_minute BETWEEN 1 AND 1440),active boolean NOT NULL DEFAULT true,
 CHECK(end_minute>start_minute),FOREIGN KEY(branch_id,clinic_id) REFERENCES clinic_branches(id,clinic_id),
 FOREIGN KEY(service_id,clinic_id) REFERENCES clinic_services(id,clinic_id),
 FOREIGN KEY(resource_id,clinic_id,branch_id) REFERENCES clinic_resources(id,clinic_id,branch_id)
);
ALTER TABLE appointment_slots ADD COLUMN working_hours_id uuid REFERENCES doctor_working_hours(id);
CREATE UNIQUE INDEX recurring_slot_once ON appointment_slots(working_hours_id,starts_at) WHERE working_hours_id IS NOT NULL;
CREATE TABLE care_time_off (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinic_id uuid NOT NULL REFERENCES clinics(id),doctor_id uuid REFERENCES users(id),
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,reason text NOT NULL,created_by uuid NOT NULL REFERENCES users(id),
 CHECK(ends_at>starts_at)
);
CREATE INDEX time_off_scope ON care_time_off(clinic_id,doctor_id,starts_at,ends_at);
ALTER TABLE appointments ADD COLUMN resource_id uuid REFERENCES clinic_resources(id);
ALTER TABLE appointments ADD CONSTRAINT appointment_resource_scope FOREIGN KEY(resource_id,clinic_id) REFERENCES clinic_resources(id,clinic_id);
ALTER TABLE appointments ADD COLUMN service_price_minor bigint NOT NULL DEFAULT 0 CHECK(service_price_minor>=0);
ALTER TABLE appointments ADD COLUMN occupied_until timestamptz;
UPDATE appointments SET occupied_until=ends_at;
ALTER TABLE appointments ALTER COLUMN occupied_until SET NOT NULL;
ALTER TABLE appointments ADD CHECK(occupied_until>=ends_at);
CREATE FUNCTION appointment_occupied_range() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.occupied_until:=COALESCE(NEW.occupied_until,NEW.ends_at);
 ELSIF NEW.ends_at IS DISTINCT FROM OLD.ends_at AND NEW.occupied_until=OLD.occupied_until THEN
  NEW.occupied_until:=NEW.ends_at+(OLD.occupied_until-OLD.ends_at);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER appointment_occupied BEFORE INSERT OR UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION appointment_occupied_range();
ALTER TABLE appointments DROP CONSTRAINT appointments_doctor_id_tstzrange_excl;
ALTER TABLE appointments ADD CONSTRAINT doctor_occupied_exclusion EXCLUDE USING gist(doctor_id WITH =,tstzrange(starts_at,occupied_until,'[)') WITH &&) WHERE(status='confirmed');
ALTER TABLE appointments ADD CONSTRAINT resource_occupied_exclusion EXCLUDE USING gist(resource_id WITH =,tstzrange(starts_at,occupied_until,'[)') WITH &&) WHERE(status='confirmed' AND resource_id IS NOT NULL);
ALTER TABLE appointments DROP CONSTRAINT appointments_status_check;
ALTER TABLE appointments ADD CHECK(status IN ('confirmed','completed','cancelled','no_show'));
ALTER TABLE appointments ADD COLUMN attendance_state text NOT NULL DEFAULT 'scheduled' CHECK(attendance_state IN ('scheduled','checked_in','in_progress'));
ALTER TABLE appointments ADD COLUMN checked_in_at timestamptz;
ALTER TABLE appointments ADD COLUMN started_at timestamptz;
CREATE TABLE appointment_state_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),appointment_id uuid NOT NULL REFERENCES appointments(id),actor_id uuid NOT NULL REFERENCES users(id),
 state text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER appointment_history_immutable BEFORE UPDATE OR DELETE ON appointment_state_history FOR EACH ROW EXECUTE FUNCTION protect_addendum();
CREATE TABLE doctor_public_profiles (
 user_id uuid PRIMARY KEY REFERENCES users(id),specialty text NOT NULL,bio text NOT NULL,languages text[] NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE doctor_reviews (
 appointment_id uuid PRIMARY KEY REFERENCES appointments(id),user_id uuid NOT NULL REFERENCES users(id),doctor_id uuid NOT NULL REFERENCES users(id),
 rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);

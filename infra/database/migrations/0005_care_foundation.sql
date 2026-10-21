CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE pets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id),
 name text NOT NULL, species text NOT NULL, breed text NOT NULL DEFAULT '', sex text NOT NULL CHECK(sex IN ('female','male','unknown')),
 birth_date date, birth_estimated boolean NOT NULL DEFAULT false, weight_grams integer CHECK(weight_grams>0),
 neutered boolean NOT NULL DEFAULT false, color text NOT NULL DEFAULT '', microchip text NOT NULL DEFAULT '',
 allergies text NOT NULL DEFAULT '', chronic_conditions text NOT NULL DEFAULT '', emergency_contact text NOT NULL DEFAULT '',
 archived_at timestamptz, version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pets_owner ON pets(owner_id);
CREATE TABLE pet_guardians (
 pet_id uuid REFERENCES pets(id), user_id uuid REFERENCES users(id), scopes text[] NOT NULL CHECK(cardinality(scopes)>0 AND scopes<@ARRAY['profile','medical','booking']::text[]),
 revoked_at timestamptz, PRIMARY KEY(pet_id,user_id)
);
CREATE TABLE medical_consents (
 pet_id uuid REFERENCES pets(id), clinic_id uuid REFERENCES clinics(id), doctor_id uuid REFERENCES users(id),
 expires_at timestamptz NOT NULL, revoked_at timestamptz, granted_by uuid NOT NULL REFERENCES users(id),
 PRIMARY KEY(pet_id,clinic_id,doctor_id)
);
CREATE TABLE clinic_services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id),
 name text NOT NULL, duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 15 AND 180), active boolean NOT NULL DEFAULT true,
 UNIQUE(id,clinic_id)
);
CREATE TABLE appointment_slots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id), doctor_id uuid NOT NULL REFERENCES users(id),
 service_id uuid NOT NULL, branch_id uuid NOT NULL REFERENCES clinic_branches(id), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 cancelled_at timestamptz, CHECK(ends_at>starts_at), FOREIGN KEY(service_id,clinic_id) REFERENCES clinic_services(id,clinic_id)
);
CREATE INDEX slots_upcoming ON appointment_slots(starts_at) WHERE cancelled_at IS NULL;
CREATE TABLE appointments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slot_id uuid NOT NULL REFERENCES appointment_slots(id), pet_id uuid NOT NULL REFERENCES pets(id),
 clinic_id uuid NOT NULL REFERENCES clinics(id), doctor_id uuid NOT NULL REFERENCES users(id), requester_id uuid NOT NULL REFERENCES users(id),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','completed','cancelled')),
 idempotency_key uuid NOT NULL, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(requester_id,idempotency_key), CHECK(ends_at>starts_at),
 EXCLUDE USING gist(doctor_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE(status='confirmed'),
 EXCLUDE USING gist(pet_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE(status='confirmed')
);
CREATE UNIQUE INDEX appointment_slot_active ON appointments(slot_id) WHERE(status='confirmed');
CREATE TABLE encounters (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id uuid NOT NULL UNIQUE REFERENCES appointments(id),
 pet_id uuid NOT NULL REFERENCES pets(id), doctor_id uuid NOT NULL REFERENCES users(id), clinic_id uuid NOT NULL REFERENCES clinics(id),
 content jsonb NOT NULL, version integer NOT NULL DEFAULT 1, signed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE encounter_addenda (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), encounter_id uuid NOT NULL REFERENCES encounters(id), doctor_id uuid NOT NULL REFERENCES users(id),
 note text NOT NULL, signed_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION protect_signed_encounter() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.signed_at IS NOT NULL THEN RAISE EXCEPTION 'Signed clinical record is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER encounter_immutable BEFORE UPDATE OR DELETE ON encounters FOR EACH ROW EXECUTE FUNCTION protect_signed_encounter();
CREATE FUNCTION protect_addendum() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Signed addendum is immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER addendum_immutable BEFORE UPDATE OR DELETE ON encounter_addenda FOR EACH ROW EXECUTE FUNCTION protect_addendum();
CREATE TABLE care_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pet_id uuid NOT NULL REFERENCES pets(id), encounter_id uuid REFERENCES encounters(id),
 created_by uuid NOT NULL REFERENCES users(id), title text NOT NULL, due_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','completed','skipped')),
 resolved_by uuid REFERENCES users(id), resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX care_tasks_pet ON care_tasks(pet_id,due_at);

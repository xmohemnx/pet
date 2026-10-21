ALTER TABLE users ADD COLUMN auth_user_id uuid UNIQUE REFERENCES auth_users(id);
ALTER TABLE clinics ADD COLUMN created_by uuid REFERENCES users(id);
ALTER TABLE clinic_memberships ADD COLUMN revoked_at timestamptz;
ALTER TABLE clinic_memberships ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE audit_events ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX auth_email_normalized ON auth_users(lower(email));

CREATE TABLE professional_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id),
 kind text NOT NULL CHECK(kind IN ('clinic','doctor','driver')),
 display_name text NOT NULL CHECK(length(display_name) BETWEEN 2 AND 120),
 registration_number text NOT NULL CHECK(length(registration_number) BETWEEN 3 AND 100),
 notes text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','suspended')),
 clinic_id uuid REFERENCES clinics(id),
 reviewed_by uuid REFERENCES users(id),
 review_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX one_open_application ON professional_applications(user_id,kind) WHERE status IN ('pending','approved');
CREATE TABLE professional_profiles (
 user_id uuid NOT NULL REFERENCES users(id),
 kind text NOT NULL CHECK(kind IN ('doctor','driver')),
 application_id uuid NOT NULL REFERENCES professional_applications(id),
 status text NOT NULL CHECK(status IN ('verified','suspended')),
 PRIMARY KEY(user_id,kind)
);
CREATE TABLE clinic_branches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 clinic_id uuid NOT NULL REFERENCES clinics(id),
 name text NOT NULL CHECK(length(name) BETWEEN 2 AND 100),
 city text NOT NULL CHECK(length(city) BETWEEN 2 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(clinic_id,name)
);
CREATE TABLE clinic_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 clinic_id uuid NOT NULL REFERENCES clinics(id),
 email text NOT NULL CHECK(email=lower(email)),
 capabilities text[] NOT NULL CHECK(cardinality(capabilities)>0 AND capabilities <@ ARRAY['clinic_admin','receptionist','commerce_manager','inventory_clerk','clinic_accountant','cashier','doctor_member']::text[]),
 invited_by uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '7 days'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitation_recipient ON clinic_invitations(email,status);
CREATE TABLE doctor_affiliations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 doctor_id uuid NOT NULL REFERENCES users(id),
 clinic_id uuid NOT NULL REFERENCES clinics(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','revoked')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(doctor_id,clinic_id)
);
CREATE TABLE admin_grants (
 user_id uuid PRIMARY KEY REFERENCES users(id),
 capabilities text[] NOT NULL DEFAULT ARRAY['verify_professionals']::text[],
 session_after timestamptz NOT NULL DEFAULT now(),
 granted_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz
);
CREATE TABLE active_workspaces (
 session_id uuid PRIMARY KEY REFERENCES auth_sessions(id) ON DELETE CASCADE,
 workspace_id text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION sync_identity_user() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO users(id,auth_user_id,display_name) VALUES(NEW.id,NEW.id,NEW.name)
 ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name;
 IF TG_OP='INSERT' THEN
  INSERT INTO audit_events(id,actor_id,action,request_id) VALUES(gen_random_uuid(),NEW.id,'identity.registered',gen_random_uuid());
 END IF;
 IF TG_OP='UPDATE' AND NEW."twoFactorEnabled" IS DISTINCT FROM OLD."twoFactorEnabled" THEN
  DELETE FROM auth_sessions WHERE "userId"=NEW.id;
  UPDATE admin_grants SET session_after=clock_timestamp() WHERE user_id=NEW.id;
  INSERT INTO audit_events(id,actor_id,action,request_id) VALUES(gen_random_uuid(),NEW.id,'identity.mfa_changed',gen_random_uuid());
 END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER identity_user_sync AFTER INSERT OR UPDATE ON auth_users FOR EACH ROW EXECUTE FUNCTION sync_identity_user();

CREATE FUNCTION protect_audit_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit events are append-only'; END;$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION protect_audit_event();

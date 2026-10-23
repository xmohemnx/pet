ALTER TABLE auth_users ADD COLUMN account_type text NOT NULL DEFAULT 'customer'
 CHECK(account_type IN ('customer','doctor','clinic','driver'));
ALTER TABLE auth_users ADD COLUMN closed_at timestamptz;

-- Preserve the primary existing professional identity without deleting history.
UPDATE auth_users u SET account_type=CASE
 WHEN EXISTS(SELECT 1 FROM clinic_memberships m WHERE m.user_id=u.id AND m.revoked_at IS NULL AND (NOT m.capabilities<@ARRAY['doctor_member','service_staff']::text[] OR NOT 'doctor_member'=ANY(m.capabilities))) THEN 'clinic'
 WHEN EXISTS(SELECT 1 FROM professional_profiles p WHERE p.user_id=u.id AND p.kind='doctor' AND p.status='verified') THEN 'doctor'
 WHEN EXISTS(SELECT 1 FROM professional_profiles p WHERE p.user_id=u.id AND p.kind='driver' AND p.status='verified') THEN 'driver'
 ELSE 'customer' END;
-- Refuse to strand active work on a retired primary identity during rollout.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM rides r JOIN auth_users u ON u.id=r.driver_id WHERE u.account_type<>'driver' AND r.status IN ('accepted','driver_en_route','arrived','in_transit'))
 OR EXISTS(SELECT 1 FROM appointments a JOIN auth_users u ON u.id=a.doctor_id WHERE u.account_type<>'doctor' AND a.status='confirmed' AND a.ends_at>now())
 THEN RAISE EXCEPTION 'Resolve active work on mixed legacy account types before applying migration 0047' USING ERRCODE='23514'; END IF;
END $$;
UPDATE professional_profiles p SET status='suspended' FROM auth_users u WHERE u.id=p.user_id AND u.account_type<>p.kind;
UPDATE clinic_memberships m SET revoked_at=now(),updated_at=now() FROM auth_users u
 WHERE u.id=m.user_id AND m.revoked_at IS NULL AND u.account_type NOT IN ('clinic','doctor');
UPDATE clinic_memberships m SET capabilities=ARRAY(SELECT c FROM unnest(m.capabilities) c WHERE c IN ('doctor_member','service_staff')),revoked_at=CASE WHEN 'doctor_member'=ANY(m.capabilities) THEN NULL ELSE now() END,updated_at=now()
 FROM auth_users u WHERE u.id=m.user_id AND u.account_type='doctor' AND m.revoked_at IS NULL;
INSERT INTO audit_events(id,actor_id,action,request_id,details)
 SELECT gen_random_uuid(),id,'identity.primary_type_migrated',gen_random_uuid(),jsonb_build_object('accountType',account_type) FROM auth_users;

CREATE TABLE account_type_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id),
 from_type text NOT NULL CHECK(from_type IN ('customer','doctor','clinic','driver')),
 target_type text NOT NULL CHECK(target_type IN ('customer','doctor','clinic','driver')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
 review_reason text,
 reviewed_by uuid REFERENCES users(id),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK(from_type<>target_type),
 CHECK(status NOT IN ('approved','rejected') OR (reviewed_by IS NOT NULL AND reviewed_by<>user_id AND length(review_reason)>=10 AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX one_pending_account_type_request ON account_type_requests(user_id) WHERE status='pending';
CREATE INDEX account_type_review_queue ON account_type_requests(status,created_at);
CREATE TABLE account_closures (
 user_id uuid PRIMARY KEY REFERENCES users(id),
 closed_at timestamptz NOT NULL DEFAULT now(),
 retention_notice text NOT NULL
);
CREATE FUNCTION guard_account_type() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.account_type IS DISTINCT FROM OLD.account_type AND NOT EXISTS(
  SELECT 1 FROM account_type_requests r WHERE r.id::text=current_setting('petra.account_type_request',true)
   AND r.user_id=OLD.id AND r.from_type=OLD.account_type AND r.target_type=NEW.account_type AND r.status='approved'
 ) THEN RAISE EXCEPTION 'Account type requires an approved administration request' USING ERRCODE='23514'; END IF;
 IF OLD.closed_at IS NOT NULL AND (NEW.closed_at IS DISTINCT FROM OLD.closed_at OR NEW.account_type IS DISTINCT FROM OLD.account_type)
 THEN RAISE EXCEPTION 'Closed account cannot be reopened' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER account_type_approval_guard BEFORE UPDATE ON auth_users FOR EACH ROW EXECUTE FUNCTION guard_account_type();
CREATE FUNCTION guard_closed_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM auth_users WHERE id=NEW."userId" AND closed_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Closed account has no sessions' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER closed_account_session_guard BEFORE INSERT ON auth_sessions FOR EACH ROW EXECUTE FUNCTION guard_closed_session();

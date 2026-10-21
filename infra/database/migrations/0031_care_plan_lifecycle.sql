ALTER TABLE care_plans ADD COLUMN category text NOT NULL DEFAULT 'رعاية عامة',
 ADD COLUMN branch_id uuid,ADD COLUMN waiting_days integer NOT NULL DEFAULT 0 CHECK(waiting_days BETWEEN 0 AND 365 AND waiting_days<valid_days),
 ADD COLUMN max_pause_days integer NOT NULL DEFAULT 0 CHECK(max_pause_days BETWEEN 0 AND 90),
 ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),
 ADD UNIQUE(id,clinic_id),ADD FOREIGN KEY(branch_id,clinic_id) REFERENCES clinic_branches(id,clinic_id);
CREATE TABLE care_plan_entitlements (
 plan_id uuid NOT NULL,clinic_id uuid NOT NULL,service_id uuid NOT NULL,uses integer NOT NULL CHECK(uses BETWEEN 1 AND 100),
 PRIMARY KEY(plan_id,service_id),FOREIGN KEY(plan_id,clinic_id) REFERENCES care_plans(id,clinic_id),FOREIGN KEY(service_id,clinic_id) REFERENCES clinic_services(id,clinic_id)
);
INSERT INTO care_plan_entitlements SELECT id,clinic_id,service_id,uses FROM care_plans;
CREATE TRIGGER care_plan_entitlements_immutable BEFORE UPDATE OR DELETE ON care_plan_entitlements FOR EACH ROW EXECUTE FUNCTION protect_addendum();
CREATE FUNCTION guard_care_plan_terms() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['active','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['active','version']) THEN RAISE EXCEPTION 'Plan terms are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER care_plan_terms_immutable BEFORE UPDATE OR DELETE ON care_plans FOR EACH ROW EXECUTE FUNCTION guard_care_plan_terms();
ALTER TABLE care_subscriptions DROP CONSTRAINT care_subscriptions_status_check;
ALTER TABLE care_subscriptions ADD CHECK(status IN ('active','cancelled','upgraded')),
 ADD COLUMN clinic_id uuid,ADD COLUMN branch_id uuid,ADD COLUMN available_at timestamptz,
 ADD COLUMN max_pause_days integer NOT NULL DEFAULT 0 CHECK(max_pause_days BETWEEN 0 AND 90),
 ADD COLUMN pause_seconds numeric NOT NULL DEFAULT 0 CHECK(pause_seconds>=0 AND pause_seconds<=max_pause_days*86400),
 ADD COLUMN paused_until timestamptz,ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),
 ADD COLUMN predecessor_id uuid UNIQUE REFERENCES care_subscriptions(id),
 ADD COLUMN operation text NOT NULL DEFAULT 'buy' CHECK(operation IN ('buy','renew','upgrade')),
 ADD CHECK((operation='buy')=(predecessor_id IS NULL)),ADD CHECK(predecessor_id IS DISTINCT FROM id);
UPDATE care_subscriptions s SET clinic_id=p.clinic_id,branch_id=p.branch_id,available_at=s.created_at FROM care_plans p WHERE p.id=s.plan_id;
ALTER TABLE care_subscriptions ALTER COLUMN clinic_id SET NOT NULL,ALTER COLUMN available_at SET NOT NULL,
 ADD UNIQUE(id,clinic_id),ADD FOREIGN KEY(plan_id,clinic_id) REFERENCES care_plans(id,clinic_id),
 ADD FOREIGN KEY(branch_id,clinic_id) REFERENCES clinic_branches(id,clinic_id),ADD CHECK(available_at<expires_at),ADD CHECK(price_minor>0 AND uses_total BETWEEN 1 AND 100);
CREATE TABLE care_subscription_entitlements (
 subscription_id uuid NOT NULL,clinic_id uuid NOT NULL,service_id uuid NOT NULL,service_name text NOT NULL,uses integer NOT NULL CHECK(uses BETWEEN 1 AND 100),
 PRIMARY KEY(subscription_id,service_id),FOREIGN KEY(subscription_id,clinic_id) REFERENCES care_subscriptions(id,clinic_id),FOREIGN KEY(service_id,clinic_id) REFERENCES clinic_services(id,clinic_id)
);
INSERT INTO care_subscription_entitlements SELECT s.id,s.clinic_id,p.service_id,cs.name,s.uses_total FROM care_subscriptions s JOIN care_plans p ON p.id=s.plan_id JOIN clinic_services cs ON cs.id=p.service_id;
CREATE TRIGGER care_subscription_entitlements_immutable BEFORE UPDATE OR DELETE ON care_subscription_entitlements FOR EACH ROW EXECUTE FUNCTION protect_addendum();
ALTER TABLE entitlement_usage ADD COLUMN service_id uuid,ADD COLUMN recognized_minor bigint;
ALTER TABLE entitlement_usage DISABLE TRIGGER usage_immutable;
WITH ranked AS (SELECT u.id,s.price_minor,s.uses_total,p.service_id,row_number() OVER(PARTITION BY u.subscription_id ORDER BY u.used_at,u.id) n FROM entitlement_usage u JOIN care_subscriptions s ON s.id=u.subscription_id JOIN care_plans p ON p.id=s.plan_id)
UPDATE entitlement_usage u SET service_id=r.service_id,recognized_minor=floor(r.price_minor::numeric*r.n/r.uses_total)-floor(r.price_minor::numeric*(r.n-1)/r.uses_total) FROM ranked r WHERE r.id=u.id;
ALTER TABLE entitlement_usage ENABLE TRIGGER usage_immutable;
ALTER TABLE entitlement_usage ALTER COLUMN service_id SET NOT NULL,ALTER COLUMN recognized_minor SET NOT NULL,
 ADD CHECK(recognized_minor>=0),ADD FOREIGN KEY(subscription_id,service_id) REFERENCES care_subscription_entitlements(subscription_id,service_id);
CREATE FUNCTION guard_care_subscription() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.status<>'active' OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['uses_used','status','expires_at','available_at','paused_until','pause_seconds','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['uses_used','status','expires_at','available_at','paused_until','pause_seconds','version']) THEN RAISE EXCEPTION 'Subscription snapshot is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER care_subscription_snapshot_immutable BEFORE UPDATE OR DELETE ON care_subscriptions FOR EACH ROW EXECUTE FUNCTION guard_care_subscription();
CREATE TABLE care_subscription_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscription_id uuid NOT NULL REFERENCES care_subscriptions(id),actor_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL CHECK(action IN ('pause','resume')),idempotency_key uuid NOT NULL,input_hash text NOT NULL,occurred_at timestamptz NOT NULL,effective_until timestamptz,
 CHECK((action='pause')=(effective_until IS NOT NULL)),
 UNIQUE(actor_id,idempotency_key)
);
CREATE TRIGGER care_subscription_events_immutable BEFORE UPDATE OR DELETE ON care_subscription_events FOR EACH ROW EXECUTE FUNCTION protect_addendum();
CREATE FUNCTION check_care_plan_entitlements() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid; BEGIN
 IF TG_TABLE_NAME='care_plans' THEN target:=NEW.id; ELSE target:=NEW.plan_id; END IF;
 IF EXISTS(SELECT 1 FROM care_plans p WHERE p.id=target AND (p.uses<>(SELECT coalesce(sum(e.uses),0) FROM care_plan_entitlements e WHERE e.plan_id=p.id) OR NOT EXISTS(SELECT 1 FROM care_plan_entitlements e WHERE e.plan_id=p.id AND e.service_id=p.service_id) OR (SELECT count(*) FROM care_plan_entitlements e WHERE e.plan_id=p.id)>10)) THEN RAISE EXCEPTION 'Plan entitlements mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER care_plan_entitlements_balance AFTER INSERT OR UPDATE ON care_plans DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_care_plan_entitlements();
CREATE CONSTRAINT TRIGGER care_plan_terms_balance AFTER INSERT ON care_plan_entitlements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_care_plan_entitlements();
CREATE FUNCTION check_care_subscription_usage() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid; BEGIN
 IF TG_TABLE_NAME='care_subscriptions' THEN target:=NEW.id; ELSE target:=NEW.subscription_id; END IF;
 IF EXISTS(SELECT 1 FROM care_subscriptions s WHERE s.id=target AND (s.uses_total<>(SELECT coalesce(sum(e.uses),0) FROM care_subscription_entitlements e WHERE e.subscription_id=s.id) OR s.uses_used<>(SELECT count(*) FROM entitlement_usage u WHERE u.subscription_id=s.id) OR floor(s.price_minor::numeric*s.uses_used/s.uses_total)<>(SELECT coalesce(sum(u.recognized_minor),0) FROM entitlement_usage u WHERE u.subscription_id=s.id) OR EXISTS(SELECT 1 FROM care_subscription_entitlements e WHERE e.subscription_id=s.id AND e.uses<(SELECT count(*) FROM entitlement_usage u WHERE u.subscription_id=s.id AND u.service_id=e.service_id)))) THEN RAISE EXCEPTION 'Subscription usage mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER care_subscription_usage_balance AFTER INSERT OR UPDATE ON care_subscriptions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_care_subscription_usage();
CREATE CONSTRAINT TRIGGER care_usage_balance AFTER INSERT ON entitlement_usage DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_care_subscription_usage();
CREATE CONSTRAINT TRIGGER care_subscription_terms_balance AFTER INSERT ON care_subscription_entitlements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_care_subscription_usage();
CREATE INDEX care_subscriptions_clinic_created ON care_subscriptions(clinic_id,created_at DESC);
CREATE INDEX entitlement_usage_service ON entitlement_usage(subscription_id,service_id);

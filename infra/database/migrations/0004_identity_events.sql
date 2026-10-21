-- Extend the existing trigger without rewriting an applied migration.
CREATE OR REPLACE FUNCTION sync_identity_user() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO users(id,auth_user_id,display_name) VALUES(NEW.id,NEW.id,NEW.name)
 ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name;
 IF TG_OP='INSERT' THEN
  INSERT INTO audit_events(id,actor_id,action,request_id) VALUES(gen_random_uuid(),NEW.id,'identity.registered',gen_random_uuid());
  INSERT INTO outbox_messages(event_id,aggregate_id,aggregate_version,event_type,payload) VALUES(gen_random_uuid(),NEW.id,1,'UserRegistered',jsonb_build_object('actorId',NEW.id));
 END IF;
 IF TG_OP='UPDATE' AND NEW."twoFactorEnabled" IS DISTINCT FROM OLD."twoFactorEnabled" THEN
  DELETE FROM auth_sessions WHERE "userId"=NEW.id;
  UPDATE admin_grants SET session_after=clock_timestamp() WHERE user_id=NEW.id;
  INSERT INTO audit_events(id,actor_id,action,request_id) VALUES(gen_random_uuid(),NEW.id,'identity.mfa_changed',gen_random_uuid());
 END IF;
 RETURN NEW;
END;$$;

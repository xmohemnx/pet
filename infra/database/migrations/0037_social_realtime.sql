ALTER TABLE social_profiles ADD COLUMN presence_enabled boolean NOT NULL DEFAULT false;
CREATE FUNCTION notify_social_realtime() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb; actor text; peer text;
BEGIN
 IF TG_OP='DELETE' THEN r:=to_jsonb(OLD); ELSE r:=to_jsonb(NEW); END IF;
 IF TG_TABLE_NAME='direct_messages' THEN actor:=r->>'sender_id'; peer:=r->>'recipient_id';
 ELSIF TG_TABLE_NAME='social_blocks' THEN actor:=r->>'blocker_id'; peer:=r->>'blocked_id';
 ELSIF TG_TABLE_NAME='social_follows' THEN actor:=r->>'follower_id'; peer:=r->>'followed_id';
 ELSIF TG_TABLE_NAME='auth_sessions' THEN actor:=r->>'userId';
 ELSE actor:=r->>'user_id'; END IF;
 PERFORM pg_notify('petra_social_realtime',jsonb_build_object('actor',actor,'peer',peer,'kind',CASE WHEN TG_TABLE_NAME='direct_messages' THEN 'changed' ELSE 'policy' END)::text);
 RETURN NULL;
END $$;
CREATE TRIGGER direct_message_realtime AFTER INSERT OR UPDATE OF read_at ON direct_messages FOR EACH ROW EXECUTE FUNCTION notify_social_realtime();
CREATE TRIGGER social_profile_realtime AFTER INSERT OR UPDATE OR DELETE ON social_profiles FOR EACH ROW EXECUTE FUNCTION notify_social_realtime();
CREATE TRIGGER social_block_realtime AFTER INSERT OR DELETE ON social_blocks FOR EACH ROW EXECUTE FUNCTION notify_social_realtime();
CREATE TRIGGER social_follow_realtime AFTER INSERT OR UPDATE OR DELETE ON social_follows FOR EACH ROW EXECUTE FUNCTION notify_social_realtime();
CREATE TRIGGER social_session_realtime AFTER DELETE ON auth_sessions FOR EACH ROW EXECUTE FUNCTION notify_social_realtime();

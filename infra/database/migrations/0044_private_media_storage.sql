ALTER TABLE media_assets ADD COLUMN storage_backend text NOT NULL DEFAULT 'local' CHECK(storage_backend IN ('local','s3')),
 ADD COLUMN scanned_at timestamptz,
 ADD COLUMN scanner_version text,
 ADD COLUMN processing_attempts integer NOT NULL DEFAULT 0 CHECK(processing_attempts BETWEEN 0 AND 1000),
 ADD COLUMN processing_retry_at timestamptz NOT NULL DEFAULT now(),
 ADD CONSTRAINT remote_media_scanned CHECK(storage_backend<>'s3' OR (scanned_at IS NOT NULL AND scanner_version IS NOT NULL AND scanner_version LIKE 'ClamAV %'));
ALTER TABLE media_streams ADD COLUMN storage_backend text NOT NULL DEFAULT 'local' CHECK(storage_backend IN ('local','s3'));
CREATE OR REPLACE FUNCTION protect_chat_asset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.owner_id,NEW.pet_id,NEW.chat_peer_id,NEW.kind,NEW.created_at,NEW.storage_backend,NEW.scanned_at,NEW.scanner_version) IS DISTINCT FROM ROW(OLD.id,OLD.owner_id,OLD.pet_id,OLD.chat_peer_id,OLD.kind,OLD.created_at,OLD.storage_backend,OLD.scanned_at,OLD.scanner_version) THEN RAISE EXCEPTION 'Media privacy and storage scope is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TABLE media_gc_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),asset_id uuid NOT NULL REFERENCES media_assets(id),
 storage_backend text NOT NULL CHECK(storage_backend IN ('local','s3')),
 storage_key text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','complete')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now(),available_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',completed_at timestamptz,
 UNIQUE(storage_backend,storage_key),CHECK(storage_key=asset_id::text||'.upload'),
 CHECK((status='complete')=(completed_at IS NOT NULL))
);
CREATE FUNCTION protect_media_gc() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Storage cleanup history is immutable' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'pending' OR NEW.attempts<>0 OR NOT EXISTS(SELECT 1 FROM media_assets WHERE id=NEW.asset_id AND kind IN ('audio','video') AND storage_backend=NEW.storage_backend AND status IN ('ready','rejected') AND (storage_key<>NEW.storage_key OR status='rejected')) THEN RAISE EXCEPTION 'Cleanup requires a retired raw upload' USING ERRCODE='23514';END IF;
 ELSIF OLD.status='complete' OR ROW(NEW.id,NEW.asset_id,NEW.storage_backend,NEW.storage_key,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.asset_id,OLD.storage_backend,OLD.storage_key,OLD.created_at) OR NEW.attempts<OLD.attempts OR NEW.attempts>OLD.attempts+1 THEN RAISE EXCEPTION 'Invalid cleanup transition' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER media_gc_guard BEFORE INSERT OR UPDATE OR DELETE ON media_gc_jobs FOR EACH ROW EXECUTE FUNCTION protect_media_gc();

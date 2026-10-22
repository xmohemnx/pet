CREATE TABLE media_streams(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 asset_id uuid NOT NULL REFERENCES media_assets(id),
 kind text NOT NULL CHECK(kind IN ('master','playlist','segment')),
 mime text NOT NULL CHECK(mime IN ('application/vnd.apple.mpegurl','video/mp2t')),
 byte_count integer NOT NULL CHECK(byte_count BETWEEN 1 AND 4194304),
 storage_key text NOT NULL UNIQUE CHECK(storage_key ~ '^[a-f0-9-]{36}\.(m3u8|ts)$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind='segment')=(mime='video/mp2t'))
);
CREATE INDEX media_streams_asset ON media_streams(asset_id);
CREATE UNIQUE INDEX one_master_per_video ON media_streams(asset_id) WHERE kind='master';
CREATE FUNCTION protect_media_stream() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Video derivatives are immutable' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM media_assets WHERE id=NEW.asset_id AND kind='video' AND pet_id IS NULL AND status IN ('pending','processing','ready')) THEN RAISE EXCEPTION 'Invalid derivative source' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER media_stream_guard BEFORE INSERT OR UPDATE OR DELETE ON media_streams FOR EACH ROW EXECUTE FUNCTION protect_media_stream();

-- Extend the existing private completion-photo boundary to the new references.
CREATE OR REPLACE FUNCTION protect_grooming_photo_privacy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ids uuid[]; asset uuid;
BEGIN
 IF TG_TABLE_NAME='clinic_storefronts' THEN ids=ARRAY[NEW.logo_asset_id,NEW.cover_asset_id]; ELSE ids=ARRAY[NEW.asset_id]; END IF;
 FOR asset IN SELECT DISTINCT unnest(ids) LOOP
  IF asset IS NULL THEN CONTINUE; END IF;
  PERFORM id FROM media_assets WHERE id=asset FOR UPDATE;
  IF TG_TABLE_NAME='grooming_photos' THEN
   IF EXISTS(SELECT 1 FROM social_posts WHERE asset_id=asset)
    OR EXISTS(SELECT 1 FROM social_post_media WHERE asset_id=asset)
    OR EXISTS(SELECT 1 FROM social_profiles WHERE avatar_asset_id=asset)
    OR EXISTS(SELECT 1 FROM product_images WHERE asset_id=asset)
    OR EXISTS(SELECT 1 FROM clinic_storefronts WHERE logo_asset_id=asset OR cover_asset_id=asset)
   THEN RAISE EXCEPTION 'Completion photos must be private' USING ERRCODE='23514'; END IF;
  ELSIF EXISTS(SELECT 1 FROM grooming_photos WHERE asset_id=asset) THEN
   RAISE EXCEPTION 'Private completion photo cannot be published' USING ERRCODE='23514';
  END IF;
 END LOOP;
 RETURN NEW;
END $$;

CREATE FUNCTION guard_social_media_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE asset uuid; expected_owner uuid; target media_assets%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='social_profiles' THEN
  asset=NEW.avatar_asset_id; expected_owner=NEW.user_id;
 ELSE
  asset=NEW.asset_id;
  SELECT user_id INTO expected_owner FROM social_posts WHERE id=NEW.post_id;
 END IF;
 IF asset IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO target FROM media_assets WHERE id=asset FOR UPDATE;
 IF NOT FOUND OR expected_owner IS NULL OR target.owner_id<>expected_owner
   OR target.status<>'ready' OR target.pet_id IS NOT NULL OR target.chat_peer_id IS NOT NULL
   OR target.kind NOT IN ('image','video')
   OR (TG_TABLE_NAME='social_profiles' AND target.kind<>'image')
   OR EXISTS(SELECT 1 FROM grooming_photos WHERE asset_id=asset)
 THEN RAISE EXCEPTION 'Invalid social media scope' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER social_album_scope_guard BEFORE INSERT OR UPDATE ON social_post_media FOR EACH ROW EXECUTE FUNCTION guard_social_media_scope();
CREATE TRIGGER social_avatar_scope_guard BEFORE INSERT OR UPDATE OF user_id,avatar_asset_id ON social_profiles FOR EACH ROW EXECUTE FUNCTION guard_social_media_scope();

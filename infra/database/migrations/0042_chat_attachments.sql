ALTER TABLE media_assets DROP CONSTRAINT media_assets_kind_check;
ALTER TABLE media_assets ADD CONSTRAINT media_assets_kind_check CHECK(kind IN ('image','video','document','audio'));
ALTER TABLE media_assets ADD COLUMN chat_peer_id uuid REFERENCES auth_users(id);
ALTER TABLE media_assets ADD CONSTRAINT chat_asset_scope CHECK(chat_peer_id IS NULL OR (chat_peer_id<>owner_id AND pet_id IS NULL));
ALTER TABLE media_assets ADD CONSTRAINT audio_chat_scope CHECK(kind<>'audio' OR chat_peer_id IS NOT NULL);
ALTER TABLE direct_messages ADD COLUMN asset_id uuid REFERENCES media_assets(id);
CREATE FUNCTION protect_chat_asset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.owner_id,NEW.pet_id,NEW.chat_peer_id,NEW.kind,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.owner_id,OLD.pet_id,OLD.chat_peer_id,OLD.kind,OLD.created_at) THEN RAISE EXCEPTION 'Media privacy scope is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER chat_asset_guard BEFORE UPDATE ON media_assets FOR EACH ROW EXECUTE FUNCTION protect_chat_asset();
CREATE FUNCTION protect_message_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW.sender_id,NEW.recipient_id,NEW.body,NEW.asset_id,NEW.idempotency_key,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.sender_id,OLD.recipient_id,OLD.body,OLD.asset_id,OLD.idempotency_key,OLD.created_at) THEN RAISE EXCEPTION 'Messages and attachments are immutable' USING ERRCODE='23514'; END IF;
 ELSIF NEW.asset_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM media_assets WHERE id=NEW.asset_id AND owner_id=NEW.sender_id AND chat_peer_id=NEW.recipient_id AND pet_id IS NULL AND status='ready' AND kind IN ('image','video','audio')) THEN RAISE EXCEPTION 'Invalid message attachment' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER direct_message_attachment_guard BEFORE INSERT OR UPDATE ON direct_messages FOR EACH ROW EXECUTE FUNCTION protect_message_attachment();
CREATE FUNCTION prevent_chat_asset_publication() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ids uuid[];
BEGIN
 IF TG_TABLE_NAME='clinic_storefronts' THEN ids:=ARRAY[NEW.logo_asset_id,NEW.cover_asset_id];ELSE ids:=ARRAY[NEW.asset_id];END IF;
 IF EXISTS(SELECT 1 FROM media_assets WHERE id=ANY(ids) AND chat_peer_id IS NOT NULL) THEN RAISE EXCEPTION 'Chat attachments cannot be republished' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER social_chat_asset_guard BEFORE INSERT OR UPDATE OF asset_id ON social_posts FOR EACH ROW EXECUTE FUNCTION prevent_chat_asset_publication();
CREATE TRIGGER catalog_chat_asset_guard BEFORE INSERT OR UPDATE OF asset_id ON product_images FOR EACH ROW EXECUTE FUNCTION prevent_chat_asset_publication();
CREATE TRIGGER storefront_chat_asset_guard BEFORE INSERT OR UPDATE OF logo_asset_id,cover_asset_id ON clinic_storefronts FOR EACH ROW EXECUTE FUNCTION prevent_chat_asset_publication();
CREATE TRIGGER grooming_chat_asset_guard BEFORE INSERT ON grooming_photos FOR EACH ROW EXECUTE FUNCTION prevent_chat_asset_publication();

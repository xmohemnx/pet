ALTER TABLE social_profiles ADD COLUMN handle text;
UPDATE social_profiles SET handle='petra_'||left(replace(user_id::text,'-',''),20);
ALTER TABLE social_profiles ALTER COLUMN handle SET NOT NULL;
ALTER TABLE social_profiles ADD CONSTRAINT social_profile_handle_format CHECK (handle ~ '^[a-z][a-z0-9_]{2,29}$');
CREATE UNIQUE INDEX social_profile_handle_unique ON social_profiles(handle);
ALTER TABLE social_profiles ADD COLUMN avatar_asset_id uuid REFERENCES media_assets(id);

ALTER TABLE social_posts ADD COLUMN creation_key uuid;
CREATE UNIQUE INDEX social_post_creation_key ON social_posts(user_id,creation_key) WHERE creation_key IS NOT NULL;
CREATE INDEX social_posts_timeline ON social_posts(created_at DESC,id DESC) WHERE deleted_at IS NULL AND moderated_at IS NULL;

CREATE TABLE social_post_media (
  post_id uuid NOT NULL REFERENCES social_posts(id),
  asset_id uuid NOT NULL REFERENCES media_assets(id),
  position smallint NOT NULL CHECK(position BETWEEN 0 AND 9),
  PRIMARY KEY(post_id,position),
  UNIQUE(post_id,asset_id)
);
CREATE INDEX social_post_media_asset ON social_post_media(asset_id);
INSERT INTO social_post_media(post_id,asset_id,position)
SELECT id,asset_id,0 FROM social_posts WHERE asset_id IS NOT NULL;

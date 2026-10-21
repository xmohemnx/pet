CREATE TABLE story_views(post_id uuid NOT NULL REFERENCES social_posts(id),viewer_id uuid NOT NULL REFERENCES users(id),viewed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(post_id,viewer_id));
CREATE TABLE story_highlights(post_id uuid PRIMARY KEY REFERENCES social_posts(id),user_id uuid NOT NULL REFERENCES users(id),title text NOT NULL CHECK(length(title) BETWEEN 1 AND 80),expires_at timestamptz NOT NULL DEFAULT now()+interval '365 days',created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE rescue_cases ADD COLUMN species text NOT NULL DEFAULT 'unknown' CHECK(species IN ('unknown','cat','dog','bird','rabbit','other'));
CREATE INDEX rescue_matching ON rescue_cases(city,species,kind,created_at DESC) WHERE status IN ('verified','assigned','in_progress');
ALTER TABLE social_posts ADD UNIQUE(id,user_id);
ALTER TABLE story_highlights ADD FOREIGN KEY(post_id,user_id) REFERENCES social_posts(id,user_id);
CREATE FUNCTION guard_highlight_story() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM social_posts WHERE id=NEW.post_id AND user_id=NEW.user_id AND kind='story' AND deleted_at IS NULL AND moderated_at IS NULL) THEN RAISE EXCEPTION 'Invalid highlighted story' USING ERRCODE='23514'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER highlight_story_scope BEFORE INSERT OR UPDATE ON story_highlights FOR EACH ROW EXECUTE FUNCTION guard_highlight_story();

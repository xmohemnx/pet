ALTER TABLE adoption_listings ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE donation_campaigns ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TABLE rescue_content_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),resource_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('adoption','campaign')),
 actor_id uuid NOT NULL REFERENCES users(id),version integer NOT NULL,previous_content jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER rescue_content_history_immutable BEFORE UPDATE OR DELETE ON rescue_content_history FOR EACH ROW EXECUTE FUNCTION protect_addendum();

CREATE TABLE care_articles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinic_id uuid NOT NULL REFERENCES clinics(id),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','approved','rejected')),published boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),CHECK(NOT published OR state='approved'),UNIQUE(id,clinic_id)
);
CREATE TABLE care_article_revisions (
 article_id uuid NOT NULL REFERENCES care_articles(id),revision integer NOT NULL,author_id uuid NOT NULL REFERENCES users(id),title text NOT NULL,body text NOT NULL,
 species text NOT NULL CHECK(species IN ('all','cat','dog','bird','rabbit','other')),age_group text NOT NULL CHECK(age_group IN ('all','young','adult','senior')),
 sources text[] NOT NULL CHECK(cardinality(sources) BETWEEN 1 AND 5),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(article_id,revision),UNIQUE(article_id,revision,author_id)
);
ALTER TABLE care_articles ADD FOREIGN KEY(id,revision) REFERENCES care_article_revisions(article_id,revision) DEFERRABLE INITIALLY DEFERRED;
CREATE TRIGGER care_article_revision_immutable BEFORE UPDATE OR DELETE ON care_article_revisions FOR EACH ROW EXECUTE FUNCTION protect_addendum();
CREATE TABLE care_article_reviews (
 article_id uuid NOT NULL,revision integer NOT NULL,author_id uuid NOT NULL,reviewer_id uuid NOT NULL REFERENCES users(id),approved boolean NOT NULL,note text NOT NULL,reviewed_at timestamptz NOT NULL DEFAULT now(),
 CHECK(author_id<>reviewer_id),PRIMARY KEY(article_id,revision),FOREIGN KEY(article_id,revision,author_id) REFERENCES care_article_revisions(article_id,revision,author_id)
);
CREATE TRIGGER care_article_review_immutable BEFORE UPDATE OR DELETE ON care_article_reviews FOR EACH ROW EXECUTE FUNCTION protect_addendum();
CREATE TABLE care_article_corrections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),article_id uuid NOT NULL,revision integer NOT NULL,reporter_id uuid NOT NULL REFERENCES users(id),reason text NOT NULL,
 response text,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved')),resolved_by uuid REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz,
 FOREIGN KEY(article_id,revision) REFERENCES care_article_revisions(article_id,revision),CHECK((status='resolved')=(resolved_by IS NOT NULL AND response IS NOT NULL AND resolved_at IS NOT NULL))
);
CREATE UNIQUE INDEX one_pending_article_correction ON care_article_corrections(article_id,reporter_id) WHERE status='pending';
CREATE FUNCTION guard_care_correction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.status='resolved' OR (to_jsonb(NEW)-ARRAY['response','status','resolved_by','resolved_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['response','status','resolved_by','resolved_at']) THEN RAISE EXCEPTION 'Correction history is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER care_correction_immutable BEFORE UPDATE OR DELETE ON care_article_corrections FOR EACH ROW EXECUTE FUNCTION guard_care_correction();

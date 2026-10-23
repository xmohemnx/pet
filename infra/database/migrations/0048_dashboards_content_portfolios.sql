CREATE TABLE site_banners (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid NOT NULL REFERENCES users(id), updated_by uuid NOT NULL REFERENCES users(id),
 title text NOT NULL CHECK(length(title) BETWEEN 2 AND 100), body text NOT NULL CHECK(length(body)<=500),
 asset_id uuid REFERENCES media_assets(id), image_alt text NOT NULL DEFAULT '' CHECK(length(image_alt)<=180),
 href text NOT NULL CHECK(href ~ '^/[a-zA-Z0-9/?=&_%#.-]*$' AND href !~ '^//'),
 position integer NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 999), published boolean NOT NULL DEFAULT false,
 starts_at timestamptz, ends_at timestamptz, deleted_at timestamptz, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at),
 CHECK(asset_id IS NULL OR length(image_alt)>=2), CHECK(deleted_at IS NULL OR NOT published)
);
CREATE INDEX site_banner_publication ON site_banners(position,created_at) WHERE published AND deleted_at IS NULL;
CREATE FUNCTION guard_site_banner_asset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.asset_id IS NOT NULL THEN PERFORM id FROM media_assets WHERE id=NEW.asset_id FOR UPDATE; END IF;
 IF NEW.asset_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.asset_id IS DISTINCT FROM OLD.asset_id) AND NOT EXISTS(
  SELECT 1 FROM media_assets WHERE id=NEW.asset_id AND owner_id=NEW.updated_by AND kind='image' AND status='ready' AND pet_id IS NULL AND chat_peer_id IS NULL AND NOT EXISTS(SELECT 1 FROM grooming_photos g WHERE g.asset_id=media_assets.id)
 ) THEN RAISE EXCEPTION 'Banner requires an owned nonprivate ready image' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER site_banner_asset_guard BEFORE INSERT OR UPDATE ON site_banners FOR EACH ROW EXECUTE FUNCTION guard_site_banner_asset();
CREATE TABLE account_verification_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), reference text NOT NULL CHECK(length(reference) BETWEEN 10 AND 1000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected','revoked')),
 review_reason text, reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK(status='pending' OR (reviewed_by IS NOT NULL AND reviewed_by<>user_id AND length(review_reason)>=10 AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX one_active_identity_verification ON account_verification_requests(user_id) WHERE status IN ('pending','verified');
CREATE INDEX verification_review_queue ON account_verification_requests(status,created_at);
CREATE TABLE professional_case_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id uuid NOT NULL UNIQUE REFERENCES appointments(id),
 doctor_id uuid NOT NULL REFERENCES users(id), clinic_id uuid NOT NULL REFERENCES clinics(id), submitted_by uuid NOT NULL REFERENCES users(id),
 procedure_kind text NOT NULL CHECK(procedure_kind IN ('surgery','treatment')), public_title text NOT NULL CHECK(length(public_title) BETWEEN 2 AND 180),
 outcome text NOT NULL CHECK(outcome IN ('pending','successful','unsuccessful')), charitable boolean NOT NULL DEFAULT false,
 evidence_reference text NOT NULL CHECK(length(evidence_reference) BETWEEN 10 AND 1000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','revoked')),
 review_reason text, reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK(status='pending' OR (reviewed_by IS NOT NULL AND reviewed_by<>submitted_by AND reviewed_by<>doctor_id AND length(review_reason)>=10 AND reviewed_at IS NOT NULL))
);
CREATE INDEX professional_reports_doctor ON professional_case_reports(doctor_id,status);
CREATE INDEX professional_reports_clinic ON professional_case_reports(clinic_id,status);
CREATE FUNCTION guard_professional_case() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM appointments a JOIN encounters e ON e.appointment_id=a.id WHERE a.id=NEW.appointment_id AND a.doctor_id=NEW.doctor_id AND a.clinic_id=NEW.clinic_id AND a.status='completed' AND e.signed_at IS NOT NULL) THEN RAISE EXCEPTION 'Portfolio requires a completed signed visit' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.appointment_id,NEW.doctor_id,NEW.clinic_id,NEW.submitted_by,NEW.procedure_kind,NEW.public_title,NEW.outcome,NEW.charitable,NEW.evidence_reference,NEW.created_at) IS DISTINCT FROM ROW(OLD.appointment_id,OLD.doctor_id,OLD.clinic_id,OLD.submitted_by,OLD.procedure_kind,OLD.public_title,OLD.outcome,OLD.charitable,OLD.evidence_reference,OLD.created_at) THEN RAISE EXCEPTION 'Submitted outcome claims are immutable; review or revoke them' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER professional_case_guard BEFORE INSERT OR UPDATE ON professional_case_reports FOR EACH ROW EXECUTE FUNCTION guard_professional_case();
ALTER TABLE site_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_case_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_categories ADD COLUMN sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order BETWEEN 0 AND 999), ADD COLUMN deleted_at timestamptz;
ALTER TABLE catalog_categories ADD CHECK(deleted_at IS NULL OR NOT active);
DROP INDEX category_sibling_name;
CREATE UNIQUE INDEX category_sibling_name ON catalog_categories(clinic_id,coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name)) WHERE deleted_at IS NULL;
CREATE OR REPLACE FUNCTION guard_catalog_category() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ancestors uuid[];
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Archive category through its scoped service' USING ERRCODE='23514'; END IF;
 IF NEW.name<>btrim(NEW.name) OR NEW.name<>normalize(NEW.name,NFKC) OR NEW.name ~ '[[:cntrl:]]' OR NEW.id='00000000-0000-0000-0000-000000000000'::uuid THEN RAISE EXCEPTION 'invalid category' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW.clinic_id,NEW.parent_id,NEW.path,NEW.idempotency_key,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.clinic_id,OLD.parent_id,OLD.path,OLD.idempotency_key,OLD.created_at) OR NEW.version<>OLD.version+1 OR OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'category identity is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.deleted_at IS NOT NULL AND (EXISTS(SELECT 1 FROM products WHERE category_id=OLD.id) OR EXISTS(SELECT 1 FROM catalog_categories WHERE parent_id=OLD.id AND deleted_at IS NULL)) THEN RAISE EXCEPTION 'Move products and children before deleting a category' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.version<>1 THEN RAISE EXCEPTION 'invalid category version' USING ERRCODE='23514'; END IF;
 IF NEW.parent_id IS NULL THEN NEW.path:=ARRAY[NEW.id]; ELSE
  SELECT path INTO ancestors FROM catalog_categories WHERE id=NEW.parent_id AND clinic_id=NEW.clinic_id AND active AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND OR cardinality(ancestors)>=4 OR EXISTS(SELECT 1 FROM catalog_categories WHERE id=ANY(ancestors) AND NOT active) THEN RAISE EXCEPTION 'invalid category parent' USING ERRCODE='23514'; END IF;
  NEW.path:=ancestors||NEW.id;
 END IF;
 RETURN NEW;
END $$;

-- Add the banner boundary without replacing the album/avatar guards from 0046.
CREATE FUNCTION guard_grooming_banner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM id FROM media_assets WHERE id=NEW.asset_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM site_banners WHERE asset_id=NEW.asset_id) THEN RAISE EXCEPTION 'Banner assets cannot become private completion photos' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER grooming_banner_guard BEFORE INSERT ON grooming_photos FOR EACH ROW EXECUTE FUNCTION guard_grooming_banner();

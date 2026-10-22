CREATE TABLE catalog_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id),
 parent_id uuid, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80), path uuid[] NOT NULL DEFAULT '{}',
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 idempotency_key uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,clinic_id), UNIQUE(clinic_id,idempotency_key),
 FOREIGN KEY(parent_id,clinic_id) REFERENCES catalog_categories(id,clinic_id)
);
CREATE UNIQUE INDEX category_sibling_name ON catalog_categories(clinic_id,coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name));
CREATE INDEX category_ancestors ON catalog_categories USING gin(path);
CREATE FUNCTION guard_catalog_category() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ancestors uuid[];
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'hide a category instead of deleting' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW.clinic_id,NEW.parent_id,NEW.name,NEW.path,NEW.idempotency_key,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.clinic_id,OLD.parent_id,OLD.name,OLD.path,OLD.idempotency_key,OLD.created_at) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'category identity is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.name<>btrim(NEW.name) OR NEW.name<>normalize(NEW.name,NFKC) OR NEW.name ~ '[[:cntrl:]]' OR NEW.id='00000000-0000-0000-0000-000000000000'::uuid OR NEW.version<>1 THEN RAISE EXCEPTION 'invalid category' USING ERRCODE='23514'; END IF;
 IF NEW.parent_id IS NULL THEN NEW.path:=ARRAY[NEW.id]; ELSE
  SELECT path INTO ancestors FROM catalog_categories WHERE id=NEW.parent_id AND clinic_id=NEW.clinic_id AND active FOR SHARE;
  IF NOT FOUND OR cardinality(ancestors)>=4 OR EXISTS(SELECT 1 FROM catalog_categories WHERE id=ANY(ancestors) AND NOT active) THEN RAISE EXCEPTION 'invalid or hidden category parent' USING ERRCODE='23514'; END IF;
  NEW.path:=ancestors||NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER catalog_category_guard BEFORE INSERT OR UPDATE OR DELETE ON catalog_categories FOR EACH ROW EXECUTE FUNCTION guard_catalog_category();
ALTER TABLE products ADD COLUMN category_id uuid, ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
 ADD CONSTRAINT product_category_clinic FOREIGN KEY(category_id,clinic_id) REFERENCES catalog_categories(id,clinic_id);
CREATE INDEX products_tags ON products USING gin(tags);
CREATE INDEX products_category ON products(category_id) WHERE category_id IS NOT NULL;
CREATE FUNCTION guard_product_classification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tag text; seen text[]:='{}'; ancestors uuid[];
BEGIN
 IF cardinality(NEW.tags)>10 OR (cardinality(NEW.tags)>0 AND (array_ndims(NEW.tags)<>1 OR array_lower(NEW.tags,1)<>1)) THEN RAISE EXCEPTION 'invalid product tags' USING ERRCODE='23514'; END IF;
 FOREACH tag IN ARRAY NEW.tags LOOP
  IF tag IS NULL OR length(tag) NOT BETWEEN 1 AND 30 OR tag<>btrim(tag) OR tag<>normalize(tag,NFKC) OR tag ~ '[[:cntrl:]]' OR lower(tag)=ANY(seen) THEN RAISE EXCEPTION 'invalid or repeated product tag' USING ERRCODE='23514'; END IF;
  seen:=array_append(seen,lower(tag));
 END LOOP;
 IF NEW.category_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id) THEN
  SELECT path INTO ancestors FROM catalog_categories WHERE id=NEW.category_id AND clinic_id=NEW.clinic_id;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM catalog_categories WHERE id=ANY(ancestors) AND NOT active) THEN RAISE EXCEPTION 'category must be active within the product clinic' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER product_classification_guard BEFORE INSERT OR UPDATE OF tags,category_id,clinic_id ON products FOR EACH ROW EXECUTE FUNCTION guard_product_classification();
CREATE FUNCTION public_product_category(category uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('id',c.id,'name',c.name,'path',(SELECT jsonb_agg(a.name ORDER BY array_position(c.path,a.id)) FROM catalog_categories a WHERE a.id=ANY(c.path)))
 FROM catalog_categories c WHERE c.id=category AND NOT EXISTS(SELECT 1 FROM catalog_categories a WHERE a.id=ANY(c.path) AND NOT a.active)
$$;

-- Every sellable variant remains a real product with its own SKU, price and stock.
ALTER TABLE products ADD COLUMN parent_product_id uuid,
 ADD COLUMN variant_label text NOT NULL DEFAULT '',
 ADD COLUMN category text NOT NULL DEFAULT '',
 ADD COLUMN brand text NOT NULL DEFAULT '',
 ADD COLUMN barcode text NOT NULL DEFAULT '',
 ADD COLUMN unit text NOT NULL DEFAULT 'قطعة',
 ADD COLUMN age_suitability text NOT NULL DEFAULT '',
 ADD COLUMN specifications jsonb NOT NULL DEFAULT '[]',
 ADD CONSTRAINT product_parent_clinic FOREIGN KEY(parent_product_id,clinic_id) REFERENCES products(id,clinic_id),
 ADD CONSTRAINT product_not_own_parent CHECK(parent_product_id IS NULL OR parent_product_id<>id),
 ADD CONSTRAINT product_variant_label CHECK(parent_product_id IS NULL OR length(variant_label) BETWEEN 1 AND 100),
 ADD CONSTRAINT product_specs_array CHECK(jsonb_typeof(specifications)='array' AND jsonb_array_length(specifications)<=12);
CREATE INDEX product_family ON products(parent_product_id) WHERE parent_product_id IS NOT NULL;
CREATE TABLE product_images (
 product_id uuid NOT NULL, clinic_id uuid NOT NULL, asset_id uuid NOT NULL REFERENCES media_assets(id),
 position integer NOT NULL CHECK(position BETWEEN 0 AND 5), alt text NOT NULL CHECK(length(alt) BETWEEN 1 AND 180),
 published_by uuid NOT NULL REFERENCES users(id), published_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(product_id,asset_id), UNIQUE(product_id,position),
 FOREIGN KEY(product_id,clinic_id) REFERENCES products(id,clinic_id)
);
CREATE INDEX product_image_asset ON product_images(asset_id);
ALTER TABLE clinic_storefronts ADD COLUMN is_primary boolean NOT NULL DEFAULT false,
 ADD COLUMN published boolean NOT NULL DEFAULT true,
 ADD COLUMN display_name text NOT NULL DEFAULT '', ADD COLUMN description text NOT NULL DEFAULT '',
 ADD COLUMN city text NOT NULL DEFAULT '', ADD COLUMN opening_hours text NOT NULL DEFAULT '',
 ADD COLUMN delivery_policy text NOT NULL DEFAULT '', ADD COLUMN return_policy text NOT NULL DEFAULT '',
 ADD COLUMN logo_asset_id uuid REFERENCES media_assets(id), ADD COLUMN cover_asset_id uuid REFERENCES media_assets(id),
 ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
WITH first_store AS (SELECT DISTINCT ON(clinic_id) id FROM clinic_storefronts ORDER BY clinic_id,id)
UPDATE clinic_storefronts SET is_primary=true WHERE id IN(SELECT id FROM first_store);
CREATE UNIQUE INDEX clinic_primary_storefront ON clinic_storefronts(clinic_id) WHERE is_primary;
INSERT INTO clinic_storefronts(id,clinic_id,slug,is_primary)
 SELECT gen_random_uuid(),c.id,'clinic-'||c.id,true FROM clinics c
 WHERE NOT EXISTS(SELECT 1 FROM clinic_storefronts s WHERE s.clinic_id=c.id AND s.is_primary);
CREATE FUNCTION create_primary_storefront() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
 INSERT INTO clinic_storefronts(id,clinic_id,slug,is_primary) VALUES(gen_random_uuid(),NEW.id,'clinic-'||NEW.id,true);
 RETURN NEW;
 END;
$$;
CREATE TRIGGER clinic_default_storefront AFTER INSERT ON clinics FOR EACH ROW EXECUTE FUNCTION create_primary_storefront();

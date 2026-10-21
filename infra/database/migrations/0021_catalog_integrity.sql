-- Defense in depth for future writers: never attach medical/video/pending assets
-- to a published catalog, and keep families one level deep within the same clinic.
CREATE FUNCTION validate_product_family() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.parent_product_id IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM products WHERE parent_product_id=NEW.id) OR
     NOT EXISTS(SELECT 1 FROM products WHERE id=NEW.parent_product_id AND clinic_id=NEW.clinic_id AND parent_product_id IS NULL) THEN
   RAISE EXCEPTION 'Invalid product family' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER product_family_guard BEFORE INSERT OR UPDATE OF parent_product_id,clinic_id ON products FOR EACH ROW EXECUTE FUNCTION validate_product_family();
CREATE FUNCTION validate_catalog_image() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM media_assets WHERE id=NEW.asset_id AND kind='image' AND status='ready' AND pet_id IS NULL) THEN
  RAISE EXCEPTION 'Catalog requires a ready nonmedical image' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER product_image_guard BEFORE INSERT OR UPDATE ON product_images FOR EACH ROW EXECUTE FUNCTION validate_catalog_image();
CREATE FUNCTION validate_store_images() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT requested.asset_id FROM unnest(ARRAY[NEW.logo_asset_id,NEW.cover_asset_id]) AS requested(asset_id) WHERE requested.asset_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM media_assets a WHERE a.id=requested.asset_id AND a.kind='image' AND a.status='ready' AND a.pet_id IS NULL)) THEN
  RAISE EXCEPTION 'Store requires ready nonmedical images' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER storefront_image_guard BEFORE INSERT OR UPDATE OF logo_asset_id,cover_asset_id ON clinic_storefronts FOR EACH ROW EXECUTE FUNCTION validate_store_images();

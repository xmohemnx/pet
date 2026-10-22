// Reused by discovery, cart, checkout and file authorization so hiding a store
// or product also removes permission to buy it or read its published images.
export const storefrontJoin = `JOIN clinics c ON c.id=p.clinic_id
 JOIN clinic_storefronts s ON s.clinic_id=p.clinic_id AND s.is_primary`;
export const sellableSql = `p.active AND c.verification_status='verified' AND s.published
 AND (p.parent_product_id IS NULL OR EXISTS(SELECT 1 FROM products parent WHERE parent.id=p.parent_product_id AND parent.active))`;
export const productImagesSql = `(SELECT coalesce(jsonb_agg(jsonb_build_object('asset_id',i.asset_id,'alt',i.alt) ORDER BY i.position),'[]') FROM product_images i WHERE i.product_id=p.id)`;
export const publicProductSql = `p.id,p.clinic_id,p.name,p.description,p.species,p.price_minor::text,
 available_stock(p.id) available,c.name clinic_name,p.sku,p.parent_product_id,p.variant_label,
 p.category,p.brand,p.barcode,p.unit,p.age_suitability,p.specifications,s.city,product_variant_attributes(p.id) variant_attributes,p.tags,public_product_category(p.category_id) classification,
 coalesce(nullif(s.display_name,''),c.name) store_name,${productImagesSql} images`;

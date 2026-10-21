-- Structured choices never merge inventory or rewrite historical product identities.
CREATE TABLE product_variant_matrices (
 parent_product_id uuid PRIMARY KEY,
 clinic_id uuid NOT NULL,
 dimensions jsonb NOT NULL,
 sku_prefix text NOT NULL CHECK(sku_prefix ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$'),
 created_by uuid NOT NULL REFERENCES users(id),
 idempotency_key uuid NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(clinic_id,idempotency_key),
 FOREIGN KEY(parent_product_id,clinic_id) REFERENCES products(id,clinic_id)
);
CREATE TABLE product_variant_choices (
 product_id uuid PRIMARY KEY REFERENCES products(id),
 parent_product_id uuid NOT NULL REFERENCES product_variant_matrices(parent_product_id),
 choice_indexes smallint[] NOT NULL,
 UNIQUE(parent_product_id,choice_indexes)
);
CREATE FUNCTION guard_variant_matrix() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d jsonb; v jsonb; names text[]:='{}'; vals text[]; n integer:=1;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'variant matrix is immutable' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM products WHERE id=NEW.parent_product_id AND clinic_id=NEW.clinic_id AND parent_product_id IS NULL FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM products WHERE parent_product_id=NEW.parent_product_id) THEN RAISE EXCEPTION 'matrix needs an original without variants' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(NEW.dimensions) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid matrix dimensions' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(NEW.dimensions) NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'invalid matrix dimension count' USING ERRCODE='23514'; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(NEW.dimensions) LOOP
  IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR jsonb_typeof(d->'name') IS DISTINCT FROM 'string' OR jsonb_typeof(d->'values') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid matrix dimension' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(d))<>2 OR length(d->>'name') NOT BETWEEN 1 AND 30 OR d->>'name'<>btrim(d->>'name') OR d->>'name'<>normalize(d->>'name',NFKC) OR lower(d->>'name')=ANY(names) OR jsonb_array_length(d->'values') NOT BETWEEN 1 AND 8 THEN RAISE EXCEPTION 'invalid matrix name or values' USING ERRCODE='23514'; END IF;
  names:=array_append(names,lower(d->>'name')); vals:='{}';
  FOR v IN SELECT value FROM jsonb_array_elements(d->'values') LOOP
   IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR length(v#>>'{}') NOT BETWEEN 1 AND 30 OR v#>>'{}'<>btrim(v#>>'{}') OR v#>>'{}'<>normalize(v#>>'{}',NFKC) OR lower(v#>>'{}')=ANY(vals) THEN RAISE EXCEPTION 'invalid or repeated variant value' USING ERRCODE='23514'; END IF;
   vals:=array_append(vals,lower(v#>>'{}'));
  END LOOP;
  n:=n*jsonb_array_length(d->'values');
 END LOOP;
 IF n>64 THEN RAISE EXCEPTION 'too many variant combinations' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER variant_matrix_guard BEFORE INSERT OR UPDATE OR DELETE ON product_variant_matrices FOR EACH ROW EXECUTE FUNCTION guard_variant_matrix();

CREATE FUNCTION guard_variant_choice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dims jsonb; i integer; label text:='';
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'variant choice is immutable' USING ERRCODE='23514'; END IF;
 SELECT m.dimensions INTO dims FROM product_variant_matrices m JOIN products p ON p.id=NEW.product_id AND p.parent_product_id=m.parent_product_id AND p.clinic_id=m.clinic_id WHERE m.parent_product_id=NEW.parent_product_id;
 IF NOT FOUND OR array_ndims(NEW.choice_indexes) IS DISTINCT FROM 1 OR array_lower(NEW.choice_indexes,1)<>1 OR cardinality(NEW.choice_indexes)<>jsonb_array_length(dims) THEN RAISE EXCEPTION 'variant choice scope or dimensions invalid' USING ERRCODE='23514'; END IF;
 FOR i IN 1..cardinality(NEW.choice_indexes) LOOP
  IF NEW.choice_indexes[i] IS NULL OR NEW.choice_indexes[i] NOT BETWEEN 1 AND jsonb_array_length(dims->(i-1)->'values') THEN RAISE EXCEPTION 'variant choice outside dimensions' USING ERRCODE='23514'; END IF;
  label:=label || CASE WHEN i>1 THEN ' · ' ELSE '' END || (dims->(i-1)->>'name') || ': ' || (dims->(i-1)->'values'->>(NEW.choice_indexes[i]-1));
 END LOOP;
 IF length(label)>100 OR NOT EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND variant_label=label) THEN RAISE EXCEPTION 'variant label must match choice' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER variant_choice_guard BEFORE INSERT OR UPDATE OR DELETE ON product_variant_choices FOR EACH ROW EXECUTE FUNCTION guard_variant_choice();

CREATE FUNCTION guard_variant_product_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.clinic_id,NEW.parent_product_id,NEW.variant_label,NEW.sku) IS NOT DISTINCT FROM ROW(OLD.id,OLD.clinic_id,OLD.parent_product_id,OLD.variant_label,OLD.sku) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM product_variant_matrices WHERE parent_product_id=OLD.id) OR EXISTS(SELECT 1 FROM product_variant_choices WHERE product_id=OLD.id) THEN RAISE EXCEPTION 'structured product identity is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER variant_product_identity_guard BEFORE UPDATE OR DELETE ON products FOR EACH ROW EXECUTE FUNCTION guard_variant_product_identity();

CREATE FUNCTION check_variant_matrix_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent uuid; dims jsonb; d jsonb; expected integer:=1;
BEGIN
 parent:=NEW.parent_product_id;
 SELECT dimensions INTO dims FROM product_variant_matrices WHERE parent_product_id=parent;
 IF NOT FOUND THEN RETURN NULL; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(dims) LOOP expected:=expected*jsonb_array_length(d->'values'); END LOOP;
 IF (SELECT count(*) FROM product_variant_choices WHERE parent_product_id=parent)<>expected OR EXISTS(SELECT 1 FROM products p WHERE p.parent_product_id=parent AND NOT EXISTS(SELECT 1 FROM product_variant_choices v WHERE v.product_id=p.id AND v.parent_product_id=parent)) THEN RAISE EXCEPTION 'variant matrix must be complete' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER variant_matrix_complete AFTER INSERT ON product_variant_matrices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_variant_matrix_complete();
CREATE CONSTRAINT TRIGGER variant_product_complete AFTER INSERT OR UPDATE ON products DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_variant_matrix_complete();

CREATE FUNCTION product_variant_attributes(product uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',d.value->>'name','value',d.value->'values'->>(v.choice_indexes[d.ordinality::integer]-1)) ORDER BY d.ordinality),'[]')
 FROM product_variant_choices v JOIN product_variant_matrices m ON m.parent_product_id=v.parent_product_id
 CROSS JOIN LATERAL jsonb_array_elements(m.dimensions) WITH ORDINALITY d(value,ordinality)
 WHERE v.product_id=product
$$;

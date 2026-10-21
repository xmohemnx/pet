-- Results arrive after a signed visit. Keep its original order unchanged.
CREATE TABLE medical_lab_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), encounter_id uuid NOT NULL REFERENCES encounters(id),
 ordinal integer NOT NULL CHECK(ordinal>=0), test text NOT NULL,
 status text NOT NULL CHECK(status IN ('requested','reviewed')), result text NOT NULL DEFAULT '',
 reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz,
 UNIQUE(encounter_id,ordinal),
 CHECK(status='requested' OR (length(trim(result))>0 AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL))
);
CREATE FUNCTION protect_reviewed_lab() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='reviewed' THEN RAISE EXCEPTION 'Reviewed medical result is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Medical order cannot be deleted' USING ERRCODE='23514'; END IF;
 IF NEW.encounter_id IS DISTINCT FROM OLD.encounter_id OR NEW.test IS DISTINCT FROM OLD.test OR NEW.ordinal IS DISTINCT FROM OLD.ordinal THEN
  RAISE EXCEPTION 'Original medical order is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lab_result_immutable BEFORE UPDATE OR DELETE ON medical_lab_orders FOR EACH ROW EXECUTE FUNCTION protect_reviewed_lab();
-- Backfill any locally signed records from the preceding migration's schema.
INSERT INTO medical_lab_orders(encounter_id,ordinal,test,status,result,reviewed_by,reviewed_at)
SELECT e.id,(l.ordinality-1)::integer,l.item->>'test',l.item->>'status',l.item->>'result',
 CASE WHEN l.item->>'status'='reviewed' THEN e.doctor_id END,
 CASE WHEN l.item->>'status'='reviewed' THEN e.signed_at END
FROM encounters e CROSS JOIN LATERAL jsonb_array_elements(e.content->'labs') WITH ORDINALITY AS l(item,ordinality)
WHERE e.signed_at IS NOT NULL;

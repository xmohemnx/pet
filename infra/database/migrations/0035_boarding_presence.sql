-- A late checkout must not permit two animals to be physically present in one unit.
CREATE UNIQUE INDEX boarding_one_present_unit ON boarding_bookings(unit_id) WHERE status='checked_in';
CREATE UNIQUE INDEX boarding_one_present_pet ON boarding_bookings(pet_id) WHERE status='checked_in';
CREATE FUNCTION guard_boarding_initial_state() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status<>'confirmed' OR NEW.version<>1 OR NEW.review_id IS NOT NULL OR NEW.checked_in_at IS NOT NULL OR NEW.checked_out_at IS NOT NULL THEN RAISE EXCEPTION 'boarding admission must follow a confirmed contract'; END IF;
 IF NOT EXISTS(SELECT 1 FROM boarding_units u JOIN pets p ON p.id=NEW.pet_id JOIN clinics c ON c.id=u.clinic_id WHERE u.id=NEW.unit_id AND u.active AND c.verification_status='verified' AND p.owner_id=NEW.user_id AND p.archived_at IS NULL AND p.species=u.species AND ROW(NEW.unit_name,NEW.pet_name,NEW.night_price,NEW.max_weight_grams,NEW.vaccines_required,NEW.health_requirements) IS NOT DISTINCT FROM ROW(u.name,p.name,u.night_price,u.max_weight_grams,u.vaccines_required,u.health_requirements)) THEN RAISE EXCEPTION 'boarding snapshot must match unit and owner'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER boarding_initial_state BEFORE INSERT ON boarding_bookings FOR EACH ROW EXECUTE FUNCTION guard_boarding_initial_state();

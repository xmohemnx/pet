ALTER TABLE rides ADD COLUMN scheduled_at timestamptz,ADD COLUMN transport_notes text NOT NULL DEFAULT '',ADD COLUMN accompanying boolean NOT NULL DEFAULT false;
CREATE TABLE ride_pets(ride_id uuid NOT NULL REFERENCES rides(id),pet_id uuid NOT NULL REFERENCES pets(id),PRIMARY KEY(ride_id,pet_id));
INSERT INTO ride_pets(ride_id,pet_id) SELECT id,pet_id FROM rides;
ALTER TABLE driver_vehicles ADD COLUMN capacity integer NOT NULL DEFAULT 1 CHECK(capacity BETWEEN 1 AND 5),
 ADD COLUMN allowed_species text[] NOT NULL DEFAULT ARRAY['all'] CHECK(cardinality(allowed_species) BETWEEN 1 AND 6 AND allowed_species<@ARRAY['all','cat','dog','bird','rabbit','other']::text[]),
 ADD COLUMN passenger_allowed boolean NOT NULL DEFAULT false;
CREATE INDEX scheduled_requests ON rides(scheduled_at) WHERE status='requested' AND scheduled_at IS NOT NULL;
CREATE FUNCTION ride_primary_pet() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO ride_pets(ride_id,pet_id) VALUES(NEW.id,NEW.pet_id);RETURN NEW;END;$$;
CREATE TRIGGER ride_primary_pet_link AFTER INSERT ON rides FOR EACH ROW EXECUTE FUNCTION ride_primary_pet();

ALTER TABLE clinic_invitations DROP CONSTRAINT clinic_invitations_capabilities_check;
ALTER TABLE clinic_invitations ADD CHECK(cardinality(capabilities)>0 AND capabilities <@ ARRAY['clinic_admin','receptionist','commerce_manager','inventory_clerk','clinic_accountant','cashier','doctor_member','service_staff']::text[]);
CREATE TABLE grooming_services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinic_id uuid NOT NULL REFERENCES clinics(id),branch_id uuid NOT NULL,name text NOT NULL,description text NOT NULL,
 species text[] NOT NULL CHECK(cardinality(species)>0 AND species <@ ARRAY['cat','dog','bird','rabbit','other']::text[]),
 price_minor bigint NOT NULL CHECK(price_minor>0),duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 15 AND 180),
 addons jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(addons)='array' AND jsonb_array_length(addons)<=10),active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1 CHECK(version>0),
 FOREIGN KEY(branch_id,clinic_id) REFERENCES clinic_branches(id,clinic_id),UNIQUE(id,clinic_id,branch_id)
);
CREATE TABLE grooming_slots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),service_id uuid NOT NULL,clinic_id uuid NOT NULL,branch_id uuid NOT NULL,staff_id uuid NOT NULL,resource_id uuid NOT NULL,
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,CHECK(ends_at>starts_at AND ends_at<=starts_at+interval '6 hours'),active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1 CHECK(version>0),
 FOREIGN KEY(service_id,clinic_id,branch_id) REFERENCES grooming_services(id,clinic_id,branch_id),FOREIGN KEY(staff_id,clinic_id) REFERENCES clinic_memberships(user_id,clinic_id),
 FOREIGN KEY(resource_id,clinic_id,branch_id) REFERENCES clinic_resources(id,clinic_id,branch_id),UNIQUE(id,clinic_id),UNIQUE(service_id,staff_id,resource_id,starts_at)
);
CREATE TABLE grooming_bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slot_id uuid NOT NULL,clinic_id uuid NOT NULL,pet_id uuid NOT NULL REFERENCES pets(id),user_id uuid NOT NULL REFERENCES users(id),
 staff_id uuid NOT NULL REFERENCES users(id),resource_id uuid NOT NULL REFERENCES clinic_resources(id),service_name text NOT NULL,total_minor bigint NOT NULL CHECK(total_minor>0),
 addons jsonb NOT NULL,starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),photos_consent boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','in_progress','completed','cancelled')),version integer NOT NULL DEFAULT 1,
 started_at timestamptz,completed_at timestamptz,idempotency_key uuid NOT NULL,request_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(slot_id,clinic_id) REFERENCES grooming_slots(id,clinic_id),UNIQUE(user_id,idempotency_key),UNIQUE(id,clinic_id)
);
CREATE UNIQUE INDEX grooming_slot_booked ON grooming_bookings(slot_id) WHERE status IN ('confirmed','in_progress');
CREATE TABLE clinic_booking_occupancy (
 source_kind text NOT NULL CHECK(source_kind IN ('appointment','grooming')),source_id uuid NOT NULL,staff_id uuid NOT NULL REFERENCES users(id),pet_id uuid NOT NULL REFERENCES pets(id),
 resource_id uuid REFERENCES clinic_resources(id),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),active boolean NOT NULL,
 PRIMARY KEY(source_kind,source_id),EXCLUDE USING gist(staff_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE(active),
 EXCLUDE USING gist(pet_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE(active),
 EXCLUDE USING gist(resource_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE(active AND resource_id IS NOT NULL)
);
INSERT INTO clinic_booking_occupancy SELECT 'appointment',id,doctor_id,pet_id,resource_id,starts_at,occupied_until,status='confirmed' FROM appointments;
CREATE FUNCTION sync_booking_occupancy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Booking history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='appointments' THEN
  INSERT INTO clinic_booking_occupancy VALUES('appointment',NEW.id,NEW.doctor_id,NEW.pet_id,NEW.resource_id,NEW.starts_at,NEW.occupied_until,NEW.status='confirmed')
  ON CONFLICT(source_kind,source_id) DO UPDATE SET staff_id=excluded.staff_id,pet_id=excluded.pet_id,resource_id=excluded.resource_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,active=excluded.active;
 ELSE
  INSERT INTO clinic_booking_occupancy VALUES('grooming',NEW.id,NEW.staff_id,NEW.pet_id,NEW.resource_id,NEW.starts_at,NEW.ends_at,NEW.status IN ('confirmed','in_progress'))
  ON CONFLICT(source_kind,source_id) DO UPDATE SET active=excluded.active;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER appointment_shared_capacity AFTER INSERT OR UPDATE OR DELETE ON appointments FOR EACH ROW EXECUTE FUNCTION sync_booking_occupancy();
CREATE TRIGGER grooming_shared_capacity AFTER INSERT OR UPDATE OR DELETE ON grooming_bookings FOR EACH ROW EXECUTE FUNCTION sync_booking_occupancy();
CREATE FUNCTION guard_grooming_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['status','version','started_at','completed_at','photos_consent']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','started_at','completed_at','photos_consent']) OR (NOT OLD.photos_consent AND NEW.photos_consent) THEN
  RAISE EXCEPTION 'Grooming snapshot is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER grooming_snapshot_immutable BEFORE UPDATE OR DELETE ON grooming_bookings FOR EACH ROW EXECUTE FUNCTION guard_grooming_snapshot();
CREATE TABLE grooming_photos (
 booking_id uuid NOT NULL REFERENCES grooming_bookings(id),asset_id uuid NOT NULL UNIQUE REFERENCES media_assets(id),PRIMARY KEY(booking_id,asset_id)
);
CREATE TRIGGER grooming_photos_immutable BEFORE UPDATE OR DELETE ON grooming_photos FOR EACH ROW EXECUTE FUNCTION protect_addendum();
CREATE TABLE grooming_reviews (
 booking_id uuid PRIMARY KEY REFERENCES grooming_bookings(id),user_id uuid NOT NULL REFERENCES users(id),rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER grooming_reviews_immutable BEFORE UPDATE OR DELETE ON grooming_reviews FOR EACH ROW EXECUTE FUNCTION protect_addendum();
CREATE FUNCTION protect_grooming_photo_privacy() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE ids uuid[]; asset uuid; BEGIN
 IF TG_TABLE_NAME='clinic_storefronts' THEN ids=ARRAY[NEW.logo_asset_id,NEW.cover_asset_id]; ELSE ids=ARRAY[NEW.asset_id]; END IF;
 FOR asset IN SELECT DISTINCT unnest(ids) LOOP
  IF asset IS NULL THEN CONTINUE; END IF;
  PERFORM id FROM media_assets WHERE id=asset FOR UPDATE;
  IF TG_TABLE_NAME='grooming_photos' THEN
   IF EXISTS(SELECT 1 FROM social_posts WHERE asset_id=asset) OR EXISTS(SELECT 1 FROM product_images WHERE asset_id=asset) OR EXISTS(SELECT 1 FROM clinic_storefronts WHERE logo_asset_id=asset OR cover_asset_id=asset) THEN RAISE EXCEPTION 'Completion photos must be private' USING ERRCODE='23514'; END IF;
  ELSIF EXISTS(SELECT 1 FROM grooming_photos WHERE asset_id=asset) THEN RAISE EXCEPTION 'Private completion photo cannot be published' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER grooming_photo_private BEFORE INSERT ON grooming_photos FOR EACH ROW EXECUTE FUNCTION protect_grooming_photo_privacy();
CREATE TRIGGER social_grooming_photo_guard BEFORE INSERT OR UPDATE OF asset_id ON social_posts FOR EACH ROW EXECUTE FUNCTION protect_grooming_photo_privacy();
CREATE TRIGGER catalog_grooming_photo_guard BEFORE INSERT OR UPDATE OF asset_id ON product_images FOR EACH ROW EXECUTE FUNCTION protect_grooming_photo_privacy();
CREATE TRIGGER storefront_grooming_photo_guard BEFORE INSERT OR UPDATE OF logo_asset_id,cover_asset_id ON clinic_storefronts FOR EACH ROW EXECUTE FUNCTION protect_grooming_photo_privacy();

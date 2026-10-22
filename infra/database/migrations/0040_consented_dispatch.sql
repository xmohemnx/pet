ALTER TABLE driver_vehicles ADD COLUMN auto_dispatch boolean NOT NULL DEFAULT false;
ALTER TABLE rides ADD COLUMN auto_dispatch boolean NOT NULL DEFAULT false;
-- The existing one_active_ride_per_driver index continues to prevent incompatible rides.
CREATE TABLE ride_dispatch_offers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ride_id uuid NOT NULL REFERENCES rides(id),
 driver_id uuid NOT NULL REFERENCES auth_users(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','expired','withdrawn')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '45 seconds',
 UNIQUE(ride_id,driver_id),CHECK(expires_at=created_at+interval '45 seconds')
);
CREATE UNIQUE INDEX one_pending_offer_per_ride ON ride_dispatch_offers(ride_id) WHERE status='pending';
CREATE UNIQUE INDEX one_pending_offer_per_driver ON ride_dispatch_offers(driver_id) WHERE status='pending';
CREATE FUNCTION protect_dispatch_offer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Dispatch history is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.status<>'pending' OR NEW.status='pending' OR ROW(NEW.id,NEW.ride_id,NEW.driver_id,NEW.created_at,NEW.expires_at) IS DISTINCT FROM ROW(OLD.id,OLD.ride_id,OLD.driver_id,OLD.created_at,OLD.expires_at) THEN RAISE EXCEPTION 'Invalid offer transition' USING ERRCODE='23514'; END IF;
  IF NEW.status='expired' AND NEW.expires_at>now() THEN RAISE EXCEPTION 'Offer is not expired' USING ERRCODE='23514'; END IF;
  IF NEW.status='accepted' AND (NEW.expires_at<=now() OR NOT EXISTS(SELECT 1 FROM rides WHERE id=NEW.ride_id AND driver_id=NEW.driver_id AND status='accepted')) THEN RAISE EXCEPTION 'Offer cannot be accepted' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.status<>'pending' OR NOT EXISTS(SELECT 1 FROM rides r JOIN driver_vehicles v ON v.user_id=NEW.driver_id JOIN professional_profiles p ON p.user_id=v.user_id AND p.kind='driver' AND p.status='verified' WHERE r.id=NEW.ride_id AND r.status='requested' AND r.auto_dispatch AND v.auto_dispatch AND v.available AND v.expires_on>=CURRENT_DATE AND v.city=r.city) THEN RAISE EXCEPTION 'Invalid dispatch target' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER dispatch_offer_guard BEFORE INSERT OR UPDATE OR DELETE ON ride_dispatch_offers FOR EACH ROW EXECUTE FUNCTION protect_dispatch_offer();
CREATE FUNCTION protect_dispatch_consent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.auto_dispatch IS DISTINCT FROM OLD.auto_dispatch THEN RAISE EXCEPTION 'Ride dispatch consent is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ride_dispatch_consent_guard BEFORE UPDATE ON rides FOR EACH ROW EXECUTE FUNCTION protect_dispatch_consent();

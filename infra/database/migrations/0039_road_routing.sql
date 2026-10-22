CREATE TABLE ride_route_attempts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth_users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ride_route_attempts_rate ON ride_route_attempts(user_id,created_at);
CREATE TABLE ride_route_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth_users(id),
 idempotency_key uuid NOT NULL,
 origin_lat numeric(9,6) NOT NULL CHECK(origin_lat BETWEEN 29 AND 38),
 origin_lng numeric(9,6) NOT NULL CHECK(origin_lng BETWEEN 38 AND 49),
 destination_lat numeric(9,6) NOT NULL CHECK(destination_lat BETWEEN 29 AND 38),
 destination_lng numeric(9,6) NOT NULL CHECK(destination_lng BETWEEN 38 AND 49),
 metres integer NOT NULL CHECK(metres BETWEEN 1 AND 100000),
 seconds integer NOT NULL CHECK(seconds BETWEEN 1 AND 86400),
 fare_minor bigint NOT NULL CHECK(fare_minor=5000000+GREATEST(1,ceil(metres::numeric/1000))::bigint*1000000),
 geometry jsonb NOT NULL CHECK(jsonb_typeof(geometry)='object' AND geometry->>'type'='LineString' AND jsonb_typeof(geometry->'coordinates')='array' AND jsonb_array_length(geometry->'coordinates') BETWEEN 2 AND 2000),
 consent_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 UNIQUE(user_id,idempotency_key), UNIQUE(id,user_id),
 CHECK(expires_at=created_at+interval '10 minutes'), CHECK(consent_at=created_at)
);
CREATE INDEX ride_route_quotes_expiry ON ride_route_quotes(expires_at);
ALTER TABLE rides ADD COLUMN route_quote_id uuid UNIQUE;
ALTER TABLE rides ADD CONSTRAINT ride_route_quote_owner FOREIGN KEY(route_quote_id,user_id) REFERENCES ride_route_quotes(id,user_id);
CREATE FUNCTION protect_road_quote() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.expires_at<now() THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Route quotes are immutable until expired deletion' USING ERRCODE='23514';
END $$;
CREATE TRIGGER road_quote_guard BEFORE UPDATE OR DELETE ON ride_route_quotes FOR EACH ROW EXECUTE FUNCTION protect_road_quote();
CREATE FUNCTION protect_quoted_ride() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q ride_route_quotes;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.route_quote_id,NEW.user_id,NEW.origin_lat,NEW.origin_lng,NEW.destination_lat,NEW.destination_lng,NEW.fare_minor,NEW.driver_share) IS DISTINCT FROM ROW(OLD.route_quote_id,OLD.user_id,OLD.origin_lat,OLD.origin_lng,OLD.destination_lat,OLD.destination_lng,OLD.fare_minor,OLD.driver_share) AND (OLD.route_quote_id IS NOT NULL OR NEW.route_quote_id IS NOT NULL) THEN
   RAISE EXCEPTION 'Quoted ride snapshot is immutable' USING ERRCODE='23514';
  END IF;
 ELSIF NEW.route_quote_id IS NOT NULL THEN
  SELECT * INTO q FROM ride_route_quotes WHERE id=NEW.route_quote_id AND user_id=NEW.user_id FOR SHARE;
  IF NOT FOUND OR q.expires_at<=now() OR ROW(NEW.origin_lat,NEW.origin_lng,NEW.destination_lat,NEW.destination_lng,NEW.fare_minor,NEW.driver_share) IS DISTINCT FROM ROW(q.origin_lat,q.origin_lng,q.destination_lat,q.destination_lng,q.fare_minor,q.fare_minor*9/10) THEN
   RAISE EXCEPTION 'Invalid or expired road quote' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER quoted_ride_guard BEFORE INSERT OR UPDATE ON rides FOR EACH ROW EXECUTE FUNCTION protect_quoted_ride();

CREATE TABLE ride_disputes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ride_id uuid NOT NULL UNIQUE REFERENCES rides(id),
 opened_by uuid NOT NULL REFERENCES auth_users(id),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 2000),
 idempotency_key uuid NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','proposed','resolved')),
 proposal_kind text CHECK(proposal_kind IN ('no_compensation','refund_full')),
 proposal_reason text CHECK(length(btrim(proposal_reason)) BETWEEN 10 AND 2000),
 proposed_by uuid REFERENCES auth_users(id),proposed_at timestamptz,
 decided_by uuid REFERENCES auth_users(id),decision_approved boolean,
 decision_reason text CHECK(length(btrim(decision_reason)) BETWEEN 10 AND 2000),decided_at timestamptz,
 journal_id uuid UNIQUE REFERENCES journals(id),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status='open' AND proposal_kind IS NULL AND proposal_reason IS NULL AND proposed_by IS NULL AND proposed_at IS NULL) OR (status<>'open' AND proposal_kind IS NOT NULL AND proposal_reason IS NOT NULL AND proposed_by IS NOT NULL AND proposed_at IS NOT NULL)),
 CHECK((status<>'resolved' AND decided_by IS NULL AND decision_approved IS NULL AND decision_reason IS NULL AND decided_at IS NULL AND journal_id IS NULL) OR (status='resolved' AND decided_by IS NOT NULL AND decision_approved IS NOT NULL AND decision_reason IS NOT NULL AND decided_at IS NOT NULL AND decided_by<>proposed_by)),
 CHECK((journal_id IS NOT NULL)=(status='resolved' AND decision_approved AND proposal_kind='refund_full'))
);
CREATE TABLE ride_dispute_messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 dispute_id uuid NOT NULL REFERENCES ride_disputes(id),
 author_id uuid NOT NULL REFERENCES auth_users(id),
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 10 AND 2000),
 idempotency_key uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(dispute_id,author_id,idempotency_key)
);
CREATE FUNCTION protect_ride_dispute() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Dispute history is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'open' OR NEW.version<>1 OR NOT EXISTS(SELECT 1 FROM rides WHERE id=NEW.ride_id AND status IN ('completed','cancelled') AND (user_id=NEW.opened_by OR driver_id=NEW.opened_by)) THEN RAISE EXCEPTION 'Invalid dispute opening' USING ERRCODE='23514'; END IF;
 ELSE
  IF ROW(NEW.id,NEW.ride_id,NEW.opened_by,NEW.reason,NEW.idempotency_key,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.ride_id,OLD.opened_by,OLD.reason,OLD.idempotency_key,OLD.created_at) OR NEW.version<>OLD.version+1 OR NOT((OLD.status='open' AND NEW.status='proposed') OR (OLD.status='proposed' AND NEW.status='resolved')) THEN RAISE EXCEPTION 'Invalid dispute transition' USING ERRCODE='23514'; END IF;
  IF OLD.status='proposed' AND ROW(NEW.proposal_kind,NEW.proposal_reason,NEW.proposed_by,NEW.proposed_at) IS DISTINCT FROM ROW(OLD.proposal_kind,OLD.proposal_reason,OLD.proposed_by,OLD.proposed_at) THEN RAISE EXCEPTION 'Proposal is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ride_dispute_guard BEFORE INSERT OR UPDATE OR DELETE ON ride_disputes FOR EACH ROW EXECUTE FUNCTION protect_ride_dispute();
CREATE FUNCTION protect_dispute_statement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d ride_disputes;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Statements are immutable' USING ERRCODE='23514'; END IF;
 SELECT * INTO d FROM ride_disputes WHERE id=NEW.dispute_id FOR UPDATE;
 IF d.status='resolved' OR (SELECT count(*) FROM ride_dispute_messages WHERE dispute_id=d.id)>=200 OR NOT(EXISTS(SELECT 1 FROM rides WHERE id=d.ride_id AND (user_id=NEW.author_id OR driver_id=NEW.author_id)) OR EXISTS(SELECT 1 FROM admin_grants WHERE user_id=NEW.author_id AND revoked_at IS NULL AND 'manage_transport_disputes'=ANY(capabilities))) THEN RAISE EXCEPTION 'Statement is not allowed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER dispute_statement_guard BEFORE INSERT OR UPDATE OR DELETE ON ride_dispute_messages FOR EACH ROW EXECUTE FUNCTION protect_dispute_statement();
CREATE FUNCTION check_transport_refund() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r rides;j journals;
BEGIN
 IF NEW.journal_id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO r FROM rides WHERE id=NEW.ride_id;
 SELECT * INTO j FROM journals WHERE id=NEW.journal_id;
 IF j.status<>'posted' OR j.source_key<>'ride-refund:'||r.id::text OR j.created_by<>NEW.proposed_by OR j.approved_by<>NEW.decided_by OR NOT EXISTS(SELECT 1 FROM ledger_entities WHERE id=j.entity_id AND kind='platform') OR NOT EXISTS(SELECT 1 FROM journals original WHERE original.id=j.reversal_of AND original.entity_id=j.entity_id AND original.source_key='ride:'||r.id::text AND original.status='posted') OR (SELECT count(*) FROM journal_lines WHERE journal_id=j.id)<>3 OR NOT EXISTS(SELECT 1 FROM journal_lines WHERE journal_id=j.id AND account_code='2200' AND party_id=r.driver_id AND debit=r.driver_share AND credit=0) OR NOT EXISTS(SELECT 1 FROM journal_lines WHERE journal_id=j.id AND account_code='4000' AND debit=r.fare_minor-r.driver_share AND credit=0) OR NOT EXISTS(SELECT 1 FROM journal_lines WHERE journal_id=j.id AND account_code='1100' AND credit=r.fare_minor AND debit=0) THEN RAISE EXCEPTION 'Invalid transport compensation journal' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER transport_refund_guard AFTER UPDATE ON ride_disputes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_transport_refund();

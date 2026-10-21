-- New foundation only. No legacy data or authorization SQL.
CREATE TYPE workspace_persona AS ENUM ('customer','doctor','clinic_member','driver','platform_admin');
CREATE TABLE users (
  id uuid PRIMARY KEY,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE clinics (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  verification_status text NOT NULL DEFAULT 'draft' CHECK (verification_status IN ('draft','submitted','verified','rejected','suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE clinic_memberships (
  user_id uuid NOT NULL REFERENCES users(id),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  capabilities text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, clinic_id)
);
CREATE TABLE clinic_storefronts (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  slug text NOT NULL UNIQUE,
  UNIQUE(id,clinic_id)
);
CREATE TABLE outbox_messages (
  event_id uuid PRIMARY KEY,
  aggregate_id uuid NOT NULL,
  aggregate_version integer NOT NULL CHECK (aggregate_version > 0),
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  processed_at timestamptz,
  UNIQUE(aggregate_id,aggregate_version)
);
CREATE INDEX outbox_pending ON outbox_messages(occurred_at) WHERE processed_at IS NULL;
CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  clinic_id uuid REFERENCES clinics(id),
  action text NOT NULL,
  request_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
-- No financial posting endpoints until the immutable ledger is implemented in Phase 04.

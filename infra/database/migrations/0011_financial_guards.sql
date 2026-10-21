ALTER TABLE journals ADD COLUMN request_hash text;
CREATE TABLE manual_journal_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),journal_id uuid NOT NULL UNIQUE REFERENCES journals(id),request_hash text NOT NULL);
ALTER TABLE rides ADD COLUMN policy_accepted_at timestamptz NOT NULL DEFAULT now();

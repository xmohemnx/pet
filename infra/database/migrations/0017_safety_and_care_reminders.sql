CREATE TABLE pet_safety_cards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pet_id uuid NOT NULL REFERENCES pets(id),owner_id uuid NOT NULL REFERENCES users(id),
 token_hash text NOT NULL UNIQUE,contact_name text NOT NULL,contact_phone text NOT NULL,message text NOT NULL,
 expires_at timestamptz NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX safety_cards_owner ON pet_safety_cards(pet_id,owner_id);
ALTER TABLE care_tasks ADD COLUMN expires_at timestamptz;
ALTER TABLE care_tasks ADD CHECK(expires_at IS NULL OR expires_at>due_at);
ALTER TABLE care_tasks DROP CONSTRAINT care_tasks_status_check;
ALTER TABLE care_tasks ADD CHECK(status IN ('planned','completed','skipped','expired'));
CREATE TABLE care_reminder_dispatches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),task_id uuid NOT NULL REFERENCES care_tasks(id),stage text NOT NULL CHECK(stage IN ('upcoming','due','overdue')),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(task_id,stage)
);
CREATE TABLE deferred_notifications (
 user_id uuid NOT NULL REFERENCES users(id),event_id uuid NOT NULL REFERENCES outbox_messages(event_id),title text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,event_id)
);

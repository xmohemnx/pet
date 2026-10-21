-- Old links remain revoked even if a pet later returns to the previous owner.
CREATE FUNCTION revoke_pet_safety_cards() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR (NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL) THEN
  UPDATE pet_safety_cards SET revoked_at=COALESCE(revoked_at,now()) WHERE pet_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pet_safety_card_revocation AFTER UPDATE OF owner_id,archived_at ON pets
FOR EACH ROW EXECUTE FUNCTION revoke_pet_safety_cards();
CREATE INDEX care_tasks_pending_due ON care_tasks(due_at) WHERE status='planned';
CREATE INDEX doctor_hours_active ON doctor_working_hours(doctor_id,clinic_id) WHERE active;
CREATE INDEX deferred_notification_age ON deferred_notifications(created_at);

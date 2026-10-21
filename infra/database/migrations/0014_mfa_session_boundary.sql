-- Existing privileged sessions must authenticate again after this hardening migration.
ALTER TABLE auth_users ADD COLUMN mfa_session_after timestamptz NOT NULL DEFAULT clock_timestamp();
CREATE FUNCTION update_mfa_session_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."twoFactorEnabled" IS DISTINCT FROM OLD."twoFactorEnabled" THEN
    NEW.mfa_session_after := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER auth_mfa_session_boundary BEFORE UPDATE OF "twoFactorEnabled" ON auth_users
FOR EACH ROW EXECUTE FUNCTION update_mfa_session_boundary();

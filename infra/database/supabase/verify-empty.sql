-- Run as the database operator immediately after bootstrap, before real users.
-- Negative access checks and identity/audit fixtures are always rolled back.
BEGIN;
DO $verify$
BEGIN
  IF (SELECT count(*) FROM petra.schema_migrations) = 0 THEN
    RAISE EXCEPTION 'Missing application migrations';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='petra' AND c.relkind='r' AND NOT c.relrowsecurity) THEN
    RAISE EXCEPTION 'A private table has no RLS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='petra' AND (p.prosecdef OR p.proconfig IS NULL)) THEN
    RAISE EXCEPTION 'Unsafe function execution context';
  END IF;
  IF has_schema_privilege('anon','petra','USAGE') OR has_schema_privilege('authenticated','petra','USAGE') THEN
    RAISE EXCEPTION 'Browser roles can access the private schema';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('petra_runtime','petra_migrator') AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)) THEN
    RAISE EXCEPTION 'Application roles have elevated permissions or active login';
  END IF;
  IF (SELECT count(*) FROM petra.users) <> 0 OR (SELECT count(*) FROM petra.auth_users) <> 0 THEN
    RAISE EXCEPTION 'Unexpected seeded users';
  END IF;
END
$verify$;
SET LOCAL ROLE petra_runtime;
SET LOCAL search_path = petra, extensions;
INSERT INTO auth_users(id,name,email,"emailVerified","updatedAt") VALUES
 ('f0a00000-0000-4000-8000-000000000001','Rolled-back schema verification','schema-check@example.invalid',false,now());
DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id='f0a00000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'Identity trigger did not resolve private tables';
  END IF;
  BEGIN
    EXECUTE 'CREATE TABLE petra.unexpected_runtime_ddl (id integer)';
    RAISE EXCEPTION 'Runtime DDL unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO schema_migrations(name,checksum) VALUES('unexpected.sql','invalid');
    RAISE EXCEPTION 'Runtime modified migration history';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$verify$;
INSERT INTO audit_events(id,actor_id,action,request_id) VALUES
 ('f0a00000-0000-4000-8000-000000000002','f0a00000-0000-4000-8000-000000000001','schema_check','f0a00000-0000-4000-8000-000000000003');
DO $verify$
BEGIN
  BEGIN
    UPDATE audit_events SET action='forbidden' WHERE id='f0a00000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'Immutable audit trigger bypassed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'audit events are append-only' THEN RAISE; END IF;
  END;
END
$verify$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $verify$
BEGIN
  BEGIN
    PERFORM count(*) FROM petra.users;
    RAISE EXCEPTION 'Anonymous role read private users';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$verify$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $verify$
BEGIN
  BEGIN
    PERFORM count(*) FROM petra.auth_sessions;
    RAISE EXCEPTION 'Authenticated browser role read sessions';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$verify$;
RESET ROLE;
ROLLBACK;

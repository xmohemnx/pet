-- Run as petra_migrator, inside the same transaction as application migrations.
-- Backend access only; browser roles must never receive schema USAGE.
REVOKE ALL ON SCHEMA petra FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA petra FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA petra FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA petra FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA petra REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
GRANT USAGE ON SCHEMA petra TO petra_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA petra TO petra_runtime;
REVOKE INSERT, UPDATE, DELETE ON petra.schema_migrations FROM petra_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA petra TO petra_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA petra TO petra_runtime;

DO $petra_hardening$
DECLARE item record;
BEGIN
  FOR item IN SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='petra' AND c.relkind IN ('r','p')
  LOOP
    EXECUTE format('ALTER TABLE petra.%I ENABLE ROW LEVEL SECURITY', item.relname);
    EXECUTE format('DROP POLICY IF EXISTS petra_backend_access ON petra.%I', item.relname);
    IF item.relname='schema_migrations' THEN
      EXECUTE format('CREATE POLICY petra_backend_access ON petra.%I FOR SELECT TO petra_runtime USING (true)', item.relname);
    ELSE
      EXECUTE format('CREATE POLICY petra_backend_access ON petra.%I FOR ALL TO petra_runtime USING (true) WITH CHECK (true)', item.relname);
    END IF;
  END LOOP;
  FOR item IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='petra'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = petra, extensions, pg_temp', item.signature);
  END LOOP;
END
$petra_hardening$;

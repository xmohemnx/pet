# Reference sanitization report

- Imported source directories: src, mobile/src, supabase/migrations, public + non-secret project configuration files.
- Removed .env, built dist, dependency locks, external provider credentials and archived Bolt prompt/tool instructions.
- Files modified by automated redaction:
- `legacy_reference/mobile/src/lib/supabase.ts`

- Always run secret scanning before committing/sharing. This sanitization is best effort, not a security guarantee.

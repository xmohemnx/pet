import { loadEnvFile } from 'node:process';
import pg from 'pg';
loadEnvFile(new URL('../.env', import.meta.url));
if (
  process.env.APP_ENV !== 'local' ||
  process.env.PETRA_ALLOW_LOCAL_FINANCE_GRANT !== 'true'
)
  throw new Error('Explicit local finance operator authorization required');
const [email, scope] = process.argv.slice(2);
if (!email || !['maker', 'checker'].includes(scope))
  throw new Error('Usage: grant-local-finance <email> <maker|checker>');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query('BEGIN');
  const user = (
    await db.query(
      'SELECT u.id FROM auth_users u JOIN admin_grants g ON g.user_id=u.id WHERE lower(u.email)=$1 AND u."emailVerified" AND u."twoFactorEnabled" AND g.revoked_at IS NULL',
      [email.toLowerCase()],
    )
  ).rows[0];
  if (!user)
    throw new Error('An existing verified MFA administrator is required');
  await db.query(
    'INSERT INTO platform_finance_grants(user_id,scopes) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET scopes=$2,revoked_at=NULL',
    [user.id, [scope]],
  );
  await db.query(
    "INSERT INTO audit_events(id,actor_id,action,request_id,details) VALUES(gen_random_uuid(),$1,'finance.operator_granted',gen_random_uuid(),$2)",
    [user.id, { scope }],
  );
  await db.query('COMMIT');
  console.log(
    'Local finance scope granted and audited; use two distinct authorized accounts.',
  );
} catch (e) {
  await db.query('ROLLBACK');
  throw e;
} finally {
  await db.end();
}

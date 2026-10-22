import pg from 'pg';
import { randomUUID } from 'node:crypto';
if (
  process.env.APP_ENV !== 'local' ||
  process.env.PETRA_ALLOW_LOCAL_ADMIN_BOOTSTRAP !== 'true'
)
  throw new Error('أداة operator محلية فقط؛ لا تستخدم لمنح أدوار في الإنتاج');
const email = process.argv[2]?.toLowerCase();
if (!email)
  throw new Error(
    'Specify the existing verified operator email as an argument',
  );
const url = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(url.hostname))
  throw new Error('Local database required');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query('BEGIN');
  const u = (
    await db.query(
      'SELECT id,"emailVerified","twoFactorEnabled" FROM auth_users WHERE lower(email)=$1 FOR UPDATE',
      [email],
    )
  ).rows[0];
  if (!u?.emailVerified || !u.twoFactorEnabled)
    throw new Error('يجب تسجيل الحساب وتأكيد البريد وإكمال TOTP أولًا');
  await db.query(
    'INSERT INTO admin_grants(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET revoked_at=NULL,session_after=clock_timestamp()',
    [u.id],
  );
  if (process.argv.includes('--transport-disputes'))
    await db.query(
      "UPDATE admin_grants SET capabilities=array_append(array_remove(capabilities,'manage_transport_disputes'),'manage_transport_disputes') WHERE user_id=$1",
      [u.id],
    );
  await db.query('DELETE FROM auth_sessions WHERE "userId"=$1', [u.id]);
  await db.query(
    "INSERT INTO audit_events(id,actor_id,request_id,action,details) VALUES($1,$2,$3,'admin.local_operator_granted',$4)",
    [
      randomUUID(),
      u.id,
      randomUUID(),
      {
        source: 'explicit-local-operator-cli',
        transportDisputes: process.argv.includes('--transport-disputes'),
      },
    ],
  );
  await db.query('COMMIT');
  console.log(
    'Local reviewer granted; existing sessions revoked. Sign in again with MFA.',
  );
} catch (e) {
  await db.query('ROLLBACK');
  throw e;
} finally {
  await db.end();
}

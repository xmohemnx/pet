import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as OTPAuth from 'otpauth';
const url = new URL(process.env.DATABASE_URL);
if (
  !['127.0.0.1', 'localhost'].includes(url.hostname) ||
  !/^\/petra_e2e_\d+$/.test(url.pathname)
)
  throw new Error('Isolated E2E database required');
execFileSync(
  process.execPath,
  ['scripts/seed-care-test.mjs', process.argv[2]],
  { stdio: 'pipe', env: { ...process.env, PETRA_FIXTURE_PLATFORM: 'true' } },
);
const fixture = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { auth } = await import('../apps/api/dist/apps/api/src/identity/auth.js');
const { database: db } =
  await import('../apps/api/dist/apps/api/src/database.js');
try {
  for (const role of ['doctor', 'stranger']) {
    const id = fixture.accounts[role].id;
    const app = (
      await db.query(
        "INSERT INTO professional_applications(user_id,kind,display_name,registration_number,status) VALUES($1,'driver','سائق fixture','LOCAL-ONLY','approved') RETURNING id",
        [id],
      )
    ).rows[0];
    await db.query(
      "INSERT INTO professional_profiles(user_id,kind,application_id,status) VALUES($1,'driver',$2,'verified')",
      [id, app.id],
    );
    await db.query(
      'UPDATE clinic_memberships SET capabilities=capabilities||$2::text[] WHERE user_id=$1 AND clinic_id=$3',
      [
        id,
        [role === 'doctor' ? 'clinic_accountant' : 'cashier'],
        fixture.clinicId,
      ],
    );
  }
  const clinicB = randomUUID(),
    branchB = randomUUID();
  await db.query(
    "INSERT INTO clinics(id,name,verification_status,created_by) VALUES($1,'عيادة أخرى للاختبار','verified',$2)",
    [clinicB, fixture.accounts.other.id],
  );
  await db.query(
    "INSERT INTO clinic_memberships(user_id,clinic_id,capabilities) VALUES($1,$2,ARRAY['clinic_admin'])",
    [fixture.accounts.other.id, clinicB],
  );
  await db.query(
    "INSERT INTO clinic_branches(id,clinic_id,name,city) VALUES($1,$2,'فرع آخر','بغداد')",
    [branchB, clinicB],
  );
  fixture.clinicB = clinicB;
  fixture.branchB = branchB;
  for (const role of ['manager', 'other', 'stranger']) {
    const a = fixture.accounts[role],
      headers = { cookie: a.cookie };
    const setup = await auth.api.enableTwoFactor({
      headers,
      body: { password: fixture.fixturePassword, method: 'totp' },
    });
    const otp = OTPAuth.URI.parse(setup.totpURI);
    await auth.api.verifyTOTP({
      headers,
      body: { code: otp.generate(), trustDevice: false },
    });
    if (role !== 'stranger')
      await db.query(
        'INSERT INTO admin_grants(user_id,session_after) VALUES($1,clock_timestamp())',
        [a.id],
      );
    await db.query('DELETE FROM auth_sessions WHERE "userId"=$1', [a.id]);
    const login = await auth.api.signInEmail({
      body: { email: a.email, password: fixture.fixturePassword },
      asResponse: true,
    });
    const challenge = login.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const verified = await auth.api.verifyTOTP({
      headers: { cookie: challenge },
      body: { code: otp.generate(), trustDevice: false },
      asResponse: true,
    });
    if (!verified.ok) throw new Error('MFA fixture failed');
    a.cookie = verified.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .filter((c) => !c.endsWith('='))
      .join('; ');
    if (role !== 'stranger')
      await db.query(
        'INSERT INTO platform_finance_grants(user_id,scopes) VALUES($1,$2)',
        [a.id, [role === 'manager' ? 'maker' : 'checker']],
      );
  }
  delete fixture.fixturePassword;
  writeFileSync(process.argv[2], JSON.stringify(fixture), { mode: 0o600 });
} finally {
  await db.end();
}
process.exit(0);

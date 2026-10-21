// Test fixtures only; identity's HTTP registration/verification is covered separately.
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const url = new URL(process.env.DATABASE_URL);
if (
  !['127.0.0.1', 'localhost'].includes(url.hostname) ||
  !/^\/petra_e2e_\d+$/.test(url.pathname)
)
  throw new Error('Care fixtures require the isolated E2E database');
const { auth } = await import('../apps/api/dist/apps/api/src/identity/auth.js');
const { database: db } =
  await import('../apps/api/dist/apps/api/src/database.js');
try {
  const password = `Local-${randomBytes(24).toString('base64url')}!9a`;
  const accounts = {};
  for (const [role, name] of Object.entries({
    owner: 'ليلى اختبار الرعاية',
    other: 'وصي الاختبار',
    doctor: 'طبيب اختبار محلي',
    stranger: 'طبيب غير معالج',
    manager: 'مدير عيادة الاختبار',
  })) {
    const email = `care-${role}-${randomUUID()}@petra.test`;
    const r = await auth.api.signUpEmail({ body: { email, password, name } });
    await db.query('UPDATE auth_users SET "emailVerified"=true WHERE id=$1', [
      r.user.id,
    ]);
    const response = await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });
    if (!response.ok) throw new Error('Fixture sign-in failed');
    accounts[role] = {
      id: r.user.id,
      email,
      cookie: response.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; '),
    };
  }
  const clinicId = randomUUID(),
    branchId = randomUUID();
  await db.query(
    "INSERT INTO clinics(id,name,verification_status,created_by) VALUES($1,'عيادة الرعاية الاختبارية','verified',$2)",
    [clinicId, accounts.manager.id],
  );
  await db.query(
    "INSERT INTO clinic_branches(id,clinic_id,name,city) VALUES($1,$2,'فرع الاختبار','بغداد')",
    [branchId, clinicId],
  );
  await db.query(
    "INSERT INTO clinic_memberships(user_id,clinic_id,capabilities) VALUES($1,$2,ARRAY['clinic_admin'])",
    [accounts.manager.id, clinicId],
  );
  for (const role of ['doctor', 'stranger']) {
    const a = (
      await db.query(
        "INSERT INTO professional_applications(user_id,kind,display_name,registration_number,status) VALUES($1,'doctor','Fixture doctor','LOCAL-TEST-ONLY','approved') RETURNING id",
        [accounts[role].id],
      )
    ).rows[0];
    await db.query(
      "INSERT INTO professional_profiles(user_id,kind,application_id,status) VALUES($1,'doctor',$2,'verified')",
      [accounts[role].id, a.id],
    );
    await db.query(
      "INSERT INTO clinic_memberships(user_id,clinic_id,capabilities) VALUES($1,$2,ARRAY['doctor_member'])",
      [accounts[role].id, clinicId],
    );
    await db.query(
      "INSERT INTO doctor_affiliations(doctor_id,clinic_id,status) VALUES($1,$2,'approved')",
      [accounts[role].id, clinicId],
    );
  }
  writeFileSync(
    process.argv[2],
    JSON.stringify({
      accounts,
      clinicId,
      branchId,
      ...(process.env.PETRA_FIXTURE_PLATFORM === 'true'
        ? { fixturePassword: password }
        : {}),
    }),
    { mode: 0o600 },
  );
} finally {
  await db.end();
}
process.exit(0);

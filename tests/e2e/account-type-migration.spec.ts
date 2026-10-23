import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

test('هجرة أنواع الحسابات ترفض ترك رحلة نشطة ثم تحفظ الرعاية المفوضة والتاريخ', async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !/^\/petra_e2e_\d+$/.test(url.pathname)
  )
    throw new Error('Local isolated E2E database required');
  const owner = new pg.Client({ connectionString: url.toString() }),
    name = `petra_e2e_${Date.now()}`;
  await owner.connect();
  let created = false,
    target: pg.Client | undefined;
  try {
    await owner.query(`CREATE DATABASE "${name}"`);
    created = true;
    url.pathname = '/' + name;
    target = new pg.Client({ connectionString: url.toString() });
    await target.connect();
    const directory = 'infra/database/migrations';
    for (const file of readdirSync(directory)
      .filter((f) => /^\d{4}_.*\.sql$/.test(f) && f < '0047_')
      .sort())
      await target.query(readFileSync(`${directory}/${file}`, 'utf8'));
    const customer = randomUUID(),
      mixed = randomUUID(),
      doctor = randomUUID(),
      driver = randomUUID(),
      clinic = randomUUID();
    for (const id of [customer, mixed, doctor, driver])
      await target.query(
        'INSERT INTO auth_users(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,false)',
        [id, 'حساب تاريخي · اختبار', id + '@petra.test'],
      );
    await target.query(
      "INSERT INTO clinics(id,name,verification_status,created_by) VALUES($1,'عيادة هجرة اختبارية','verified',$2)",
      [clinic, mixed],
    );
    await target.query(
      "INSERT INTO clinic_memberships(user_id,clinic_id,capabilities) VALUES($1,$2,ARRAY['clinic_admin']),($3,$2,ARRAY['doctor_member','service_staff'])",
      [mixed, clinic, doctor],
    );
    for (const [id, kind] of [
      [mixed, 'driver'],
      [driver, 'driver'],
      [doctor, 'doctor'],
    ]) {
      const app = (
        await target.query(
          "INSERT INTO professional_applications(user_id,kind,display_name,registration_number,status) VALUES($1,$2,'اعتماد fixture','LOCAL-ONLY','approved') RETURNING id",
          [id, kind],
        )
      ).rows[0].id;
      await target.query(
        "INSERT INTO professional_profiles(user_id,kind,application_id,status) VALUES($1,$2,$3,'verified')",
        [id, kind, app],
      );
    }
    const pet = (
      await target.query(
        "INSERT INTO pets(owner_id,name,species,sex) VALUES($1,'حيوان هجرة اختباري','cat','unknown') RETURNING id",
        [customer],
      )
    ).rows[0].id;
    const ride = (
      await target.query(
        "INSERT INTO rides(user_id,pet_id,driver_id,city,origin_label,destination_label,origin_lat,origin_lng,destination_lat,destination_lng,fare_minor,driver_share,status,idempotency_key) VALUES($1,$2,$3,'بغداد','بداية اختبار','نهاية اختبار',33.3,44.3,33.4,44.4,6000000,4000000,'accepted',$4) RETURNING id",
        [customer, pet, mixed, randomUUID()],
      )
    ).rows[0].id;
    const migration = readFileSync(
      `${directory}/0047_fixed_account_types.sql`,
      'utf8',
    );
    await target.query('BEGIN');
    await expect(target.query(migration)).rejects.toThrow(
      'Resolve active work',
    );
    await target.query('ROLLBACK');
    expect(
      (
        await target.query(
          "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='auth_users' AND column_name='account_type'",
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await target.query(
          'SELECT status FROM professional_profiles WHERE user_id=$1',
          [mixed],
        )
      ).rows[0].status,
    ).toBe('verified');
    await target.query("UPDATE rides SET status='cancelled' WHERE id=$1", [
      ride,
    ]);
    await target.query('BEGIN');
    await target.query(migration);
    await target.query('COMMIT');
    const rows = (await target.query('SELECT id,account_type FROM auth_users'))
      .rows;
    const types = Object.fromEntries(rows.map((r) => [r.id, r.account_type]));
    expect(types).toMatchObject({
      [customer]: 'customer',
      [mixed]: 'clinic',
      [doctor]: 'doctor',
      [driver]: 'driver',
    });
    expect(
      (
        await target.query(
          'SELECT status FROM professional_profiles WHERE user_id=$1',
          [mixed],
        )
      ).rows[0].status,
    ).toBe('suspended');
    expect(
      (
        await target.query(
          'SELECT capabilities,revoked_at FROM clinic_memberships WHERE user_id=$1',
          [doctor],
        )
      ).rows[0],
    ).toMatchObject({
      capabilities: ['doctor_member', 'service_staff'],
      revoked_at: null,
    });
    expect(
      (await target.query('SELECT status FROM rides WHERE id=$1', [ride]))
        .rows[0].status,
    ).toBe('cancelled');
    expect(
      (
        await target.query(
          "SELECT count(*)::int n FROM audit_events WHERE action='identity.primary_type_migrated'",
        )
      ).rows[0].n,
    ).toBe(4);
  } finally {
    await target?.end();
    if (created) await owner.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await owner.end();
  }
});

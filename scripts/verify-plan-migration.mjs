import { loadEnvFile } from 'node:process';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
loadEnvFile(new URL('../.env', import.meta.url));
const source = new URL(process.env.DATABASE_URL);
if (
  !['127.0.0.1', 'localhost'].includes(source.hostname) ||
  !/^\/petra_[a-z0-9_]+$/.test(source.pathname)
)
  throw new Error('Migration verification requires a local Petra database');
const name = `petra_plan_upgrade_${process.pid}`,
  owner = new pg.Client({ connectionString: source.toString() });
await owner.connect();
let created = false,
  db;
try {
  await owner.query(`CREATE DATABASE "${name}"`);
  created = true;
  source.pathname = `/${name}`;
  db = new pg.Client({ connectionString: source.toString() });
  await db.connect();
  const migrationRoot = new URL(
    '../infra/database/migrations/',
    import.meta.url,
  );
  for (const file of (await readdir(migrationRoot))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && f < '0031')
    .sort()) {
    await db.query('BEGIN');
    await db.query(await readFile(new URL(file, migrationRoot), 'utf8'));
    await db.query('COMMIT');
  }
  const user = randomUUID(),
    clinic = randomUUID();
  await db.query('INSERT INTO users(id,display_name) VALUES($1,$2)', [
    user,
    'مصطنع لاختبار ترحيل الباقات',
  ]);
  await db.query('INSERT INTO clinics(id,name) VALUES($1,$2)', [
    clinic,
    'عيادة اختبار ترحيل غير حقيقية',
  ]);
  const branch = (
    await db.query(
      "INSERT INTO clinic_branches(clinic_id,name,city) VALUES($1,'فرع اختبار','بغداد') RETURNING id",
      [clinic],
    )
  ).rows[0].id;
  const service = (
    await db.query(
      "INSERT INTO clinic_services(clinic_id,name,duration_minutes) VALUES($1,'خدمة اختبار',30) RETURNING id",
      [clinic],
    )
  ).rows[0].id;
  const pet = (
    await db.query(
      "INSERT INTO pets(owner_id,name,species,sex) VALUES($1,'حيوان اصطناعي','cat','unknown') RETURNING id",
      [user],
    )
  ).rows[0].id;
  const plan = (
    await db.query(
      "INSERT INTO care_plans(clinic_id,service_id,name,price_minor,uses,valid_days) VALUES($1,$2,'باقة سابقة',10001,3,30) RETURNING id",
      [clinic, service],
    )
  ).rows[0].id;
  const sub = (
    await db.query(
      "INSERT INTO care_subscriptions(plan_id,pet_id,user_id,uses_total,uses_used,price_minor,expires_at,idempotency_key) VALUES($1,$2,$3,3,2,10001,now()+interval '30 days',$4) RETURNING id",
      [plan, pet, user, randomUUID()],
    )
  ).rows[0].id;
  const ledger = (
    await db.query(
      "INSERT INTO ledger_entities(kind,clinic_id) VALUES('clinic',$1) RETURNING id",
      [clinic],
    )
  ).rows[0].id;
  for (const [code, label] of [
    ['2100', 'مؤجل'],
    ['4100', 'إيراد'],
  ])
    await db.query(
      'INSERT INTO ledger_accounts(entity_id,code,name) VALUES($1,$2,$3)',
      [ledger, code, label],
    );
  for (let n = 0; n < 2; n++) {
    const slot = (
      await db.query(
        "INSERT INTO appointment_slots(clinic_id,doctor_id,service_id,branch_id,starts_at,ends_at) VALUES($1,$2,$3,$4,now()-make_interval(days=>$5),now()-make_interval(days=>$5)+interval '30 minutes') RETURNING *",
        [clinic, user, service, branch, n + 1],
      )
    ).rows[0];
    const appt = (
      await db.query(
        "INSERT INTO appointments(slot_id,pet_id,clinic_id,doctor_id,requester_id,starts_at,ends_at,status,idempotency_key) VALUES($1,$2,$3,$4,$4,$5,$6,'completed',$7) RETURNING id",
        [
          slot.id,
          pet,
          clinic,
          user,
          slot.starts_at,
          slot.ends_at,
          randomUUID(),
        ],
      )
    ).rows[0].id;
    const encounter = (
      await db.query(
        "INSERT INTO encounters(appointment_id,pet_id,doctor_id,clinic_id,content,signed_at) VALUES($1,$2,$3,$4,'{}',now()) RETURNING id",
        [appt, pet, user, clinic],
      )
    ).rows[0].id;
    const usage = (
      await db.query(
        'INSERT INTO entitlement_usage(subscription_id,encounter_id,actor_id,used_at) VALUES($1,$2,$3,now()+make_interval(secs=>$4)) RETURNING id',
        [sub, encounter, user, n],
      )
    ).rows[0].id;
    await db.query('BEGIN');
    const journal = (
      await db.query(
        "INSERT INTO journals(entity_id,source_key,description,created_by) VALUES($1,$2,'اعتراف سابق اختباري',$3) RETURNING id",
        [ledger, `usage:${usage}`, user],
      )
    ).rows[0].id;
    const amount = n === 0 ? '3333' : '3334';
    await db.query(
      "INSERT INTO journal_lines(journal_id,entity_id,account_code,debit,credit) VALUES($1,$2,'2100',$3,0),($1,$2,'4100',0,$3)",
      [journal, ledger, amount],
    );
    await db.query(
      "UPDATE journals SET status='posted',posted_at=now() WHERE id=$1",
      [journal],
    );
    await db.query('COMMIT');
  }
  const before = (
    await db.query('SELECT row_to_json(j) data FROM journals j ORDER BY id')
  ).rows;
  const legacyUnit = (
    await db.query(
      "INSERT INTO boarding_units(clinic_id,name,species,night_price) VALUES($1,'وحدة ترحيل اصطناعية','cat',1000) RETURNING id",
      [clinic],
    )
  ).rows[0].id;
  const legacyBoarding = (
    await db.query(
      "INSERT INTO boarding_bookings(unit_id,pet_id,user_id,starts_on,ends_on,total_minor,idempotency_key) VALUES($1,$2,$3,'2028-01-01','2028-01-04',3000,$4) RETURNING id",
      [legacyUnit, pet, user, randomUUID()],
    )
  ).rows[0].id;
  await db.query('UPDATE boarding_units SET night_price=9000 WHERE id=$1', [
    legacyUnit,
  ]);
  const legacyCheckedIn = (
    await db.query(
      "INSERT INTO boarding_bookings(unit_id,pet_id,user_id,starts_on,ends_on,total_minor,idempotency_key,status) VALUES($1,$2,$3,'2028-02-01','2028-02-03',2000,$4,'checked_in') RETURNING id",
      [legacyUnit, pet, user, randomUUID()],
    )
  ).rows[0].id;

  const legacyProduct = (
    await db.query(
      "INSERT INTO products(clinic_id,sku,name,price_minor,cost_minor) VALUES($1,'LEGACY-MATRIX','أصل SKU سابق',4321,1234) RETURNING id",
      [clinic],
    )
  ).rows[0].id;
  const legacyChild = (
    await db.query(
      "INSERT INTO products(clinic_id,sku,name,price_minor,cost_minor,parent_product_id,variant_label) VALUES($1,'LEGACY-CHILD','خيار SKU سابق',5678,2345,$2,'قديم') RETURNING id",
      [clinic, legacyProduct],
    )
  ).rows[0].id;
  const oldProducts = (
    await db.query(
      "SELECT (to_jsonb(p)-'category_id'-'tags') data FROM products p WHERE id=ANY($1::uuid[]) ORDER BY id",
      [[legacyProduct, legacyChild]],
    )
  ).rows;
  await db.query('BEGIN');
  await db.query(
    await readFile(
      new URL('0031_care_plan_lifecycle.sql', migrationRoot),
      'utf8',
    ),
  );
  await db.query('COMMIT');
  await db.query(
    await readFile(
      new URL('0032_care_subscription_history_index.sql', migrationRoot),
      'utf8',
    ),
  );
  await db.query('BEGIN');
  await db.query(
    await readFile(new URL('0033_home_visits.sql', migrationRoot), 'utf8'),
  );
  await db.query(
    await readFile(
      new URL('0034_boarding_admission.sql', migrationRoot),
      'utf8',
    ),
  );
  await db.query(
    await readFile(
      new URL('0035_boarding_presence.sql', migrationRoot),
      'utf8',
    ),
  );
  await db.query(
    await readFile(
      new URL('0036_product_variant_matrices.sql', migrationRoot),
      'utf8',
    ),
  );
  await db.query(
    await readFile(new URL('0037_social_realtime.sql', migrationRoot), 'utf8'),
  );
  await db.query(
    await readFile(new URL('0038_catalog_taxonomy.sql', migrationRoot), 'utf8'),
  );
  await db.query(
    await readFile(new URL('0039_road_routing.sql', migrationRoot), 'utf8'),
  );
  await db.query(
    await readFile(
      new URL('0040_consented_dispatch.sql', migrationRoot),
      'utf8',
    ),
  );
  await db.query(
    await readFile(
      new URL('0041_transport_disputes.sql', migrationRoot),
      'utf8',
    ),
  );
  await db.query(
    await readFile(new URL('0042_chat_attachments.sql', migrationRoot), 'utf8'),
  );
  await db.query(
    await readFile(new URL('0043_adaptive_video.sql', migrationRoot), 'utf8'),
  );
  await db.query(
    await readFile(
      new URL('0044_private_media_storage.sql', migrationRoot),
      'utf8',
    ),
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT (to_jsonb(p)-'category_id'-'tags') data FROM products p WHERE id=ANY($1::uuid[]) ORDER BY id",
        [[legacyProduct, legacyChild]],
      )
    ).rows,
    oldProducts,
  );
  assert.equal(
    (await db.query('SELECT count(*)::int n FROM product_variant_matrices'))
      .rows[0].n,
    0,
  );
  assert.deepEqual(
    (
      await db.query('SELECT product_variant_attributes($1) attrs', [
        legacyChild,
      ])
    ).rows[0].attrs,
    [],
  );
  const migratedBoarding = (
    await db.query(
      'SELECT total_minor::text,night_price::text,policy_accepted,status FROM boarding_bookings WHERE id=$1',
      [legacyBoarding],
    )
  ).rows[0];
  assert.deepEqual(migratedBoarding, {
    total_minor: '3000',
    night_price: '1000',
    policy_accepted: false,
    status: 'confirmed',
  });
  const grandfathered = (
    await db.query(
      'SELECT total_minor::text,night_price::text,policy_accepted,status FROM boarding_bookings WHERE id=$1',
      [legacyCheckedIn],
    )
  ).rows[0];
  assert.deepEqual(grandfathered, {
    total_minor: '2000',
    night_price: '1000',
    policy_accepted: false,
    status: 'checked_in',
  });
  await db.query(
    "UPDATE boarding_bookings SET status='completed',checked_out_at=now(),version=version+1 WHERE id=$1",
    [legacyCheckedIn],
  );

  await db.query('COMMIT');
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM appointments WHERE visit_mode='clinic' AND occupied_from=starts_at",
      )
    ).rows[0].n,
    2,
  );
  assert.deepEqual(
    (await db.query('SELECT row_to_json(j) data FROM journals j ORDER BY id'))
      .rows,
    before,
  );
  assert.deepEqual(
    (
      await db.query(
        'SELECT service_id,uses FROM care_subscription_entitlements WHERE subscription_id=$1',
        [sub],
      )
    ).rows,
    [{ service_id: service, uses: 3 }],
  );
  assert.deepEqual(
    (
      await db.query(
        'SELECT service_id,recognized_minor::text amount FROM entitlement_usage WHERE subscription_id=$1 ORDER BY used_at,id',
        [sub],
      )
    ).rows,
    [
      { service_id: service, amount: '3333' },
      { service_id: service, amount: '3334' },
    ],
  );
  await assert.rejects(
    db.query(
      'UPDATE care_subscriptions SET uses_used=3,version=version+1 WHERE id=$1',
      [sub],
    ),
    { code: '23514' },
  );
  await assert.rejects(
    db.query('DELETE FROM entitlement_usage WHERE subscription_id=$1', [sub]),
    { code: '23514' },
  );
  console.log(
    'PASS: legacy plan/partial usage migrated; original journals unchanged; snapshots, exact recognition, immutable usage and legacy boarding price preserved',
  );
} finally {
  if (db) {
    await db.query('ROLLBACK').catch(() => {});
    await db.end();
  }
  if (created) await owner.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await owner.end();
}

import { ForbiddenException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { database } from '../database.js';
export const accountTypes = ['customer', 'doctor', 'clinic', 'driver'] as const;
export type AccountType = (typeof accountTypes)[number];
export async function accountPolicy(
  userId: string,
  db: PoolClient | typeof database = database,
) {
  const row = (
    await db.query(
      'SELECT account_type,closed_at FROM auth_users WHERE id=$1' +
        (db === database ? '' : ' FOR SHARE'),
      [userId],
    )
  ).rows[0];
  if (!row || row.closed_at) throw new ForbiddenException('هذا الحساب مغلق');
  return row.account_type as AccountType;
}
export async function lockAccount(db: PoolClient, userId: string) {
  await db.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('account-policy:'||$1::text,0))",
    [userId],
  );
  await db.query('SELECT id FROM auth_users WHERE id=$1 FOR UPDATE', [userId]);
}
export async function requireAccountType(
  userId: string,
  types: readonly string[],
  db: PoolClient | typeof database = database,
) {
  const type = await accountPolicy(userId, db);
  if (!types.includes(type))
    throw new ForbiddenException(
      'هذا القسم غير متاح لنوع حسابك. تغيير النوع يتطلب موافقة الإدارة.',
    );
  return type;
}

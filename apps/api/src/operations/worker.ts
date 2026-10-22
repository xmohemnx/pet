import { dispatchRides } from '../services/dispatch.js';
import { expireRoadQuotes } from '../services/routing.js';
import { expireScheduledRides } from '../services/rides.js';
import 'reflect-metadata';
import {
  scheduleCareReminders,
  deliverDeferredNotifications,
} from '../care/reminders.js';
import { createServer } from 'node:http';
import { createClient } from 'redis';
import { database, transaction } from '../database.js';
import { processMedia, processMediaGc } from '../media/service.js';
const titles: Record<string, string> = {
  DirectMessageCreated: 'وصلت رسالة جديدة',
  AppointmentConfirmed: 'تأكد موعد رعاية',
  VisitSigned: 'حُفظت زيارة موقعة ومتابعتها',
  RideDisputeResolved: 'حسم نزاع الرحلة؛ راجع سجل النزاع الخاص',
  RideDispatchOffered: 'عرض رحلة متاح للقبول خلال 45 ثانية',
  RideAccepted: 'قبل سائق رحلة النقل',
  RescueCaseAccepted: 'قبلت عيادة بلاغ الإنقاذ',
  OrderCaptured: 'حُفظ التحصيل الاختباري للطلب',
  SubscriptionCreated: 'أُضيف اشتراك الرعاية',
  CareTaskReminder: 'لديك متابعة رعاية تحتاج مراجعتك',
};
export async function processEvent(id: string) {
  return transaction(async (db) => {
    const event = (
      await db.query(
        'SELECT * FROM outbox_messages WHERE event_id=$1 AND processed_at IS NULL AND failed_at IS NULL FOR UPDATE',
        [id],
      )
    ).rows[0];
    if (!event) return false;
    const recipients = new Set<string>();
    if (event.payload.actorId) recipients.add(event.payload.actorId);
    if (event.event_type === 'DirectMessageCreated') {
      const m = (
        await db.query('SELECT recipient_id FROM direct_messages WHERE id=$1', [
          event.aggregate_id,
        ])
      ).rows[0];
      if (m) recipients.add(m.recipient_id);
    }
    if (
      ['AppointmentConfirmed', 'AppointmentCompleted'].includes(
        event.event_type,
      )
    ) {
      const a = (
        await db.query(
          'SELECT a.doctor_id,p.owner_id FROM appointments a JOIN pets p ON p.id=a.pet_id WHERE a.id=$1',
          [event.aggregate_id],
        )
      ).rows[0];
      if (a) {
        recipients.add(a.doctor_id);
        recipients.add(a.owner_id);
      }
    }
    if (event.event_type === 'VisitSigned') {
      const e = (
        await db.query(
          'SELECT p.owner_id FROM encounters e JOIN pets p ON p.id=e.pet_id WHERE e.id=$1',
          [event.aggregate_id],
        )
      ).rows[0];
      if (e) recipients.add(e.owner_id);
    }
    if (event.event_type === 'RideAccepted') {
      const r = (
        await db.query('SELECT user_id FROM rides WHERE id=$1', [
          event.aggregate_id,
        ])
      ).rows[0];
      if (r) recipients.add(r.user_id);
    }
    if (event.event_type === 'RescueCaseAccepted') {
      const c = (
        await db.query('SELECT user_id FROM rescue_cases WHERE id=$1', [
          event.aggregate_id,
        ])
      ).rows[0];
      if (c) recipients.add(c.user_id);
    }
    for (const user of recipients) {
      const pref = (
        await db.query(
          'SELECT * FROM notification_preferences WHERE user_id=$1',
          [user],
        )
      ).rows[0];
      if (pref?.in_app === false) continue;
      const hour = (new Date().getUTCHours() + 3) % 24;
      if (pref?.quiet_start != null && pref.quiet_end != null) {
        const quiet =
          pref.quiet_start < pref.quiet_end
            ? hour >= pref.quiet_start && hour < pref.quiet_end
            : hour >= pref.quiet_start || hour < pref.quiet_end;
        if (quiet) {
          await db.query(
            'INSERT INTO deferred_notifications(user_id,event_id,title) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
            [user, id, titles[event.event_type] ?? 'حُدّثت بيانات في حسابك'],
          );
          continue;
        }
      }
      await db.query(
        'INSERT INTO notifications(user_id,event_id,title) VALUES($1,$2,$3) ON CONFLICT(user_id,event_id) DO NOTHING',
        [user, id, titles[event.event_type] ?? 'حُدّثت بيانات في حسابك'],
      );
    }
    await db.query(
      'UPDATE outbox_messages SET processed_at=now() WHERE event_id=$1',
      [id],
    );
    return true;
  });
}
export async function runWorker() {
  const redis = createClient({ url: process.env.REDIS_URL });
  redis.on('error', () => undefined);
  await redis.connect();
  const health = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({ status: redis.isReady ? 'ready' : 'unavailable' }),
    );
  });
  await new Promise<void>((resolve) =>
    health.listen(
      Number(process.env.WORKER_HEALTH_PORT ?? 4002),
      '127.0.0.1',
      resolve,
    ),
  );
  let stopping = false;
  process.on('SIGTERM', () => {
    stopping = true;
  });
  process.on('SIGINT', () => {
    stopping = true;
  });
  const queue = `petra:${new URL(process.env.DATABASE_URL!).pathname}:jobs`;
  console.log(
    'Petra worker ready: transactional outbox, notifications, private media',
  );
  try {
    while (!stopping) {
      await scheduleCareReminders();
      await expireRoadQuotes();
      await expireScheduledRides();
      await dispatchRides();
      await deliverDeferredNotifications();
      const jobs = await transaction(async (db) => {
        const rows = (
          await db.query(
            "SELECT event_id FROM outbox_messages WHERE processed_at IS NULL AND failed_at IS NULL AND available_at<=now() AND (queued_at IS NULL OR queued_at<now()-interval '1 minute') ORDER BY occurred_at FOR UPDATE SKIP LOCKED LIMIT 20",
          )
        ).rows;
        for (const r of rows) {
          await redis.lPush(queue, r.event_id);
          await db.query(
            'UPDATE outbox_messages SET queued_at=now() WHERE event_id=$1',
            [r.event_id],
          );
        }
        return rows.length;
      });
      const id = await redis.rPop(queue);
      if (id) {
        try {
          await processEvent(id);
        } catch {
          await database.query(
            "UPDATE outbox_messages SET attempts=attempts+1,queued_at=NULL,available_at=now()+(least(300,power(2,attempts+1))::text||' seconds')::interval,failed_at=CASE WHEN attempts+1>=5 THEN now() END,last_error='تعذر تنفيذ المهمة؛ راجع المصدر وأعد المحاولة' WHERE event_id=$1 AND processed_at IS NULL",
            [id],
          );
        }
      }
      await processMedia();
      await processMediaGc();
      await transaction(async (db) => {
        const expired = (
          await db.query(
            "SELECT id,user_id FROM checkout_orders WHERE status='reserved' AND expires_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 10",
          )
        ).rows;
        for (const o of expired) {
          const lines = (
            await db.query(
              'SELECT l.* FROM order_lines l JOIN clinic_orders c ON c.id=l.order_id WHERE c.parent_id=$1 ORDER BY l.product_id',
              [o.id],
            )
          ).rows;
          for (const l of lines)
            await db.query(
              'UPDATE products SET reserved=reserved-$2 WHERE id=$1',
              [l.product_id, l.quantity],
            );
          await db.query(
            "UPDATE checkout_orders SET status='expired' WHERE id=$1",
            [o.id],
          );
          await db.query(
            "UPDATE clinic_orders SET status='cancelled' WHERE parent_id=$1",
            [o.id],
          );
        }
      });
      if (!id && !jobs)
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } finally {
    health.close();
    await redis.quit();
    await database.end();
  }
}

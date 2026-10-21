import { transaction } from '../database.js';
import { emit } from '../organizations/service.js';
export async function scheduleCareReminders() {
  return transaction(async (db) => {
    await db.query(
      "UPDATE care_tasks SET status='expired' WHERE status='planned' AND expires_at<=now()",
    );
    const tasks = (
      await db.query(
        "SELECT t.id,p.owner_id,CASE WHEN t.due_at>now() THEN 'upcoming' WHEN t.due_at>now()-interval '24 hours' THEN 'due' ELSE 'overdue' END stage FROM care_tasks t JOIN pets p ON p.id=t.pet_id AND p.archived_at IS NULL WHERE t.status='planned' AND t.due_at<=now()+interval '24 hours' AND t.due_at>now()-interval '7 days' AND NOT EXISTS(SELECT 1 FROM care_reminder_dispatches d WHERE d.task_id=t.id AND d.stage=CASE WHEN t.due_at>now() THEN 'upcoming' WHEN t.due_at>now()-interval '24 hours' THEN 'due' ELSE 'overdue' END) ORDER BY t.due_at FOR UPDATE OF t SKIP LOCKED LIMIT 30",
      )
    ).rows;
    for (const task of tasks) {
      const r = (
        await db.query(
          'INSERT INTO care_reminder_dispatches(task_id,stage) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id',
          [task.id, task.stage],
        )
      ).rows[0];
      if (r) await emit(db, task.owner_id, 'CareTaskReminder', r.id, 1);
    }
    return tasks.length;
  });
}
export async function deliverDeferredNotifications() {
  return transaction(async (db) => {
    const hour = "extract(hour FROM now() AT TIME ZONE 'Asia/Baghdad')";
    const rows = (
      await db.query(
        `SELECT d.*,p.in_app FROM deferred_notifications d LEFT JOIN notification_preferences p ON p.user_id=d.user_id WHERE p.in_app=false OR p.quiet_start IS NULL OR p.quiet_end IS NULL OR CASE WHEN p.quiet_start<p.quiet_end THEN NOT(${hour}>=p.quiet_start AND ${hour}<p.quiet_end) ELSE NOT(${hour}>=p.quiet_start OR ${hour}<p.quiet_end) END ORDER BY d.created_at FOR UPDATE OF d SKIP LOCKED LIMIT 30`,
      )
    ).rows;
    for (const row of rows) {
      if (row.in_app !== false)
        await db.query(
          'INSERT INTO notifications(user_id,event_id,title) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [row.user_id, row.event_id, row.title],
        );
      await db.query(
        'DELETE FROM deferred_notifications WHERE user_id=$1 AND event_id=$2',
        [row.user_id, row.event_id],
      );
    }
  });
}

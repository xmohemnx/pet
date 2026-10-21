'use client';
import { useState } from 'react';
import type { IdentityMe, AppNotification } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { CareForm, CareAction, careDate } from './care-shared';
import { api } from '../lib/auth-client';
import { PlatformHeading, Empty, mutate } from './platform-shared';
export function Notifications({
  me,
  initial,
  prefs,
}: {
  me: IdentityMe;
  initial: AppNotification[];
  prefs: {
    in_app: boolean;
    quiet_start: number | null;
    quiet_end: number | null;
  };
}) {
  const [items, setItems] = useState(initial);
  async function refresh() {
    setItems(await api<AppNotification[]>('me/notifications'));
  }
  return (
    <IdentityShell me={me}>
      <PlatformHeading eyebrow="أخبار حسابك" title="الإشعارات" />
      <div className="care-columns">
        <section className="panel care-section">
          <h2>آخر التحديثات</h2>
          <CareAction action={refresh}>تحديث الإشعارات</CareAction>
          {!items.length && (
            <Empty>
              لا إشعارات بعد. تظهر بعد معالجة أحداث الحساب بواسطة عامل المهام.
            </Empty>
          )}
          {items.map((n) => (
            <article className="care-list-row" key={n.id}>
              <div>
                <h3>{n.title}</h3>
                <p>{careDate(n.created_at)}</p>
              </div>
              {!n.read_at && (
                <CareAction
                  action={async () => {
                    await mutate(`me/notifications/${n.id}/read`);
                    await refresh();
                  }}
                >
                  وضع علامة مقروء
                </CareAction>
              )}
            </article>
          ))}
        </section>
        <section className="panel care-section">
          <h2>تفضيلاتك</h2>
          <CareForm
            label="حفظ تفضيلات الإشعارات"
            submit={(f) =>
              mutate('me/notification-preferences', {
                inApp: f.get('enabled') === 'on',
                quietStart:
                  f.get('start') === '' ? null : Number(f.get('start')),
                quietEnd: f.get('end') === '' ? null : Number(f.get('end')),
              }).then(() => undefined)
            }
          >
            <label className="care-check">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={prefs.in_app}
              />
              إشعارات داخل التطبيق
            </label>
            <label>
              بداية الكتم (ساعة بغداد)
              <input
                type="number"
                name="start"
                min="0"
                max="23"
                defaultValue={prefs.quiet_start ?? ''}
              />
            </label>
            <label>
              نهاية الكتم
              <input
                type="number"
                name="end"
                min="0"
                max="23"
                defaultValue={prefs.quiet_end ?? ''}
              />
            </label>
            <p className="panel-intro">
              تؤجل الإشعارات أثناء ساعات الكتم وتظهر بعد انتهائها. بيانات
              معاملاتك تبقى في صفحاتها. لا بريد أو SMS أو push خارجي في هذا
              الإعداد.
            </p>
          </CareForm>
        </section>
      </div>
    </IdentityShell>
  );
}

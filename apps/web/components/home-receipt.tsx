'use client';
import Link from 'next/link';
import type { IdentityMe, HomeVisitBooking } from '@petra/contracts';
import { IdentityShell } from './identity-shell';
import { HomeVisitCard } from './home-visits';
export function HomeReceipt({
  me,
  booking,
}: {
  me: IdentityMe;
  booking: HomeVisitBooking;
}) {
  return (
    <IdentityShell me={me}>
      <div className="medical-passport">
        <h1>إيصال زيارة منزلية اختباري</h1>
        <div className="no-print care-actions">
          <Link className="button outline" href="/home-visits">
            الزيارات المنزلية
          </Link>
          <button
            type="button"
            className="button primary"
            onClick={() => window.print()}
          >
            طباعة الإيصال
          </button>
        </div>
        <HomeVisitCard booking={booking} />
      </div>
    </IdentityShell>
  );
}

'use client';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { MediaAsset } from '@petra/contracts';
import { api } from '../lib/auth-client';
import { CareForm } from './care-shared';
export function SandboxNotice() {
  return (
    <aside className="sandbox-notice" aria-label="وضع المعاملات">
      وضع اختبار محلي · لا خصم مصرفي أو تحويل أو تبرع مالي حقيقي. المبالغ
      المعروضة بوحدات IQD وفق سياسة اختبار، وليست أسعار إطلاق.
    </aside>
  );
}
export function PlatformHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="care-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="compact-empty">{children}</p>;
}
export async function mutate<T = unknown>(path: string, body: unknown = {}) {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}
export const statusLabels: Record<string, string> = {
  reserved: 'محجوز',
  captured: 'محصل اختباريًا',
  confirmed: 'مؤكد',
  packed: 'مجهز',
  shipped: 'مشحون',
  delivered: 'تم التسليم',
  returned: 'مرتجع',
  cancelled: 'ملغى',
  expired: 'منتهٍ',
  pending: 'قيد المراجعة',
  approved: 'مقبول',
  rejected: 'مرفوض',
  completed: 'مكتمل',
  ordered: 'طلب شراء',
  received: 'مستلم',
  billed: 'فاتورة مورد',
  paid: 'مدفوع اختباريًا',
  draft: 'مسودة',
  posted: 'مرحّل',
  active: 'نشط',
  waiting: 'بانتظار الأهلية',
  exhausted: 'مستنفد',
  upgraded: 'استُبدل بترقية',
  paused: 'متوقف',
  adopted: 'تم التبني',
  submitted: 'مقدّم',
  verified: 'تمت مراجعته',
  assigned: 'قبلته عيادة',
  in_progress: 'قيد المعالجة',
  resolved: 'تم الحل',
  requested: 'مطلوب',
  accepted: 'مقبول',
  driver_en_route: 'السائق في الطريق',
  arrived: 'وصل السائق',
  in_transit: 'أثناء النقل',
  checked_in: 'حاضر',
  refunded: 'مردود اختباريًا',
  reconciled: 'مطابق',
  ready: 'جاهز',
  processing: 'قيد المعالجة',
};
export function Status({ value }: { value: string }) {
  return <span className="small-chip">{statusLabels[value] ?? value}</span>;
}
export function MediaUpload({
  onUploaded,
  petId,
  imagesOnly = false,
}: {
  onUploaded: (asset: MediaAsset) => void;
  petId?: string;
  imagesOnly?: boolean;
}) {
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  return (
    <>
      <CareForm
        label="رفع الملف وفحصه"
        submit={async (f) => {
          const file = f.get('file') as File;
          if (!file?.size) throw new Error('اختر ملفًا');
          if (file.size > (petId || imagesOnly ? 5 : 20) * 1024 * 1024)
            throw new Error('الملف أكبر من الحد');
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]!);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          const a = await api<MediaAsset>('media', {
            method: 'POST',
            body: JSON.stringify({
              dataBase64: data,
              ...(petId ? { petId } : {}),
            }),
          });
          setAsset(a);
          onUploaded(a);
        }}
      >
        <label>
          {petId
            ? 'مرفق طبي خاص (صورة)'
            : imagesOnly
              ? 'صورة المنتج أو المتجر'
              : 'صورة أو MP4 حتى دقيقة'}
          <input
            type="file"
            name="file"
            accept={
              petId || imagesOnly
                ? 'image/png,image/jpeg,image/webp'
                : 'image/png,image/jpeg,image/webp,video/mp4'
            }
            required
          />
        </label>
        <p className="panel-intro">
          الصور حتى 5 ميغابايت، والفيديو حتى 20. تُزال بيانات الصورة الوصفية،
          ولا يُنشر الفيديو قبل انتهاء التحويل.
        </p>
      </CareForm>
      {asset && (
        <p role="status">
          الوسيط: <Status value={asset.status} />
        </p>
      )}
    </>
  );
}

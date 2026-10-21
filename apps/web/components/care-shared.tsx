'use client';
import { useState, type ReactNode, type FormEvent } from 'react';
export function CareForm({
  children,
  submit,
  label = 'حفظ',
  className = '',
}: {
  children: ReactNode;
  submit: (form: FormData) => Promise<void>;
  label?: ReactNode;
  className?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await submit(data);
      setMessage('تم الحفظ');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={`care-form ${className}`} onSubmit={send}>
      <fieldset disabled={busy}>
        {children}
        <button className="button primary" type="submit">
          {busy ? 'جارٍ الحفظ…' : label}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="form-success">
          {message}
        </p>
      )}
    </form>
  );
}
export function CareAction({
  children,
  action,
}: {
  children: ReactNode;
  action: () => Promise<void>;
}) {
  return (
    <CareForm submit={action} label={children}>
      <span className="sr-only">{children}</span>
    </CareForm>
  );
}
export function careDate(value: string) {
  return new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Baghdad',
  }).format(new Date(value));
}
export function localToUtc(value: FormDataEntryValue | null) {
  // datetime-local fields explicitly represent Baghdad (UTC+03, no DST).
  return new Date(`${String(value)}:00+03:00`).toISOString();
}
export const speciesLabels: Record<string, string> = {
  cat: 'قط',
  dog: 'كلب',
  bird: 'طائر',
  rabbit: 'أرنب',
  other: 'آخر',
};
export const appointmentLabels: Record<string, string> = {
  confirmed: 'مؤكد',
  completed: 'مكتمل',
  cancelled: 'ملغى',
  no_show: 'لم يحضر',
};
export const attendanceLabels: Record<string, string> = {
  scheduled: 'بانتظار الحضور',
  checked_in: 'حضر',
  in_progress: 'الزيارة جارية',
};

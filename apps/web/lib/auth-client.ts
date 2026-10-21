'use client';
import { createAuthClient } from 'better-auth/react';
import { twoFactorClient } from 'better-auth/client/plugins';
export const authClient = createAuthClient({
  basePath: '/api/v1/auth',
  plugins: [twoFactorClient()],
});
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const r = await fetch(`/api/v1/${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    cache: 'no-store',
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.message || 'تعذر إتمام الطلب');
  return body as T;
}
export function authError(code?: string) {
  const messages: Record<string, string> = {
    INVALID_EMAIL_OR_PASSWORD: 'البريد أو كلمة المرور غير صحيحة',
    EMAIL_NOT_VERIFIED: 'أكّد بريدك الإلكتروني عبر الرسالة التي وصلتك أولًا',
    USER_ALREADY_EXISTS:
      'تعذر إنشاء الحساب بهذا البريد؛ جرّب الدخول أو الاستعادة',
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
      'تعذر إنشاء الحساب بهذا البريد؛ جرّب الدخول أو الاستعادة',
    INVALID_TOKEN: 'الرابط غير صالح أو انتهت صلاحيته',
    INVALID_TWO_FACTOR_COOKIE: 'انتهت مهلة التحقق؛ سجل الدخول من جديد',
    INVALID_TOTP_CODE:
      'رمز التحقق غير صحيح؛ جرّب الرمز الحالي من تطبيق المصادقة',
    INVALID_BACKUP_CODE: 'رمز الاسترداد غير صحيح',
    PASSWORD_TOO_SHORT: 'يجب ألا تقل كلمة المرور عن 12 حرفًا',
    TOO_MANY_REQUESTS: 'محاولات كثيرة؛ انتظر قليلًا ثم أعد المحاولة',
  };
  return (
    messages[code || ''] || 'تعذر إتمام العملية. تحقق من البيانات وحاول مجددًا.'
  );
}

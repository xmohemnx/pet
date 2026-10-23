import type { IdentityMe } from '@petra/contracts';
export function accountDestination(me: IdentityMe) {
  const type = me.user.accountType;
  if (type === 'customer') return '/app';
  if (type === 'clinic') {
    const w = me.workspaces.find(
      (w) => w.persona === 'clinic_member' && w.clinicId,
    );
    return w ? `/clinic/${w.clinicId}` : '/account';
  }
  return me.workspaces.some((w) => w.id === type) ? `/${type}` : '/account';
}

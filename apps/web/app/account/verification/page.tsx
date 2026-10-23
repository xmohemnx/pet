import { loadIdentity } from '../../../lib/server-identity';
import { loadApi } from '../../../lib/platform-server';
import type { VerificationRequest } from '@petra/contracts';
import { AccountVerification } from '../../../components/account-verification';
export const metadata = {
  title: 'توثيق الحساب',
  robots: { index: false, follow: false },
};
export default async function Page() {
  return (
    <AccountVerification
      me={await loadIdentity()}
      initial={await loadApi<VerificationRequest[]>('me/verifications')}
    />
  );
}

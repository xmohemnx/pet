import { loadIdentity } from '../../../../lib/server-identity';
import { loadApi } from '../../../../lib/platform-server';
import { notFound } from 'next/navigation';
import type { ProfessionalPortfolio } from '@petra/contracts';
import { PortfolioView } from '../../../../components/professional-portfolio';
export const metadata = {
  title: 'الملف المهني الموثق',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!['doctor', 'clinic'].includes(kind)) notFound();
  return (
    <PortfolioView
      me={await loadIdentity()}
      profile={await loadApi<ProfessionalPortfolio>(
        `professional-profiles/${kind}/${encodeURIComponent(id)}`,
      )}
    />
  );
}

import { AuthForm } from '../../components/auth-forms';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ closed?: string }>;
}) {
  const { closed } = await searchParams;
  return <AuthForm mode="login" closed={closed === '1'} />;
}

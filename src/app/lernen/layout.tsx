import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionServer } from '@/lib/authOptions';

export default async function LernenLayout({ children }: { children: ReactNode }) {
  const session = await getSessionServer();
  if (!session?.user) redirect('/login');
  return <>{children}</>;
}

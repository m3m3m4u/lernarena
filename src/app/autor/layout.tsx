import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionServer } from '@/lib/authOptions';

export default async function AutorLayout({ children }: { children: ReactNode }) {
  const session = await getSessionServer();
  if (!session?.user || session.user.role !== 'author') {
    redirect('/login?error=not-author');
  }
  return <>{children}</>;
}

import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionServer } from '@/lib/authOptions';

export default async function AutorLayout({ children }: { children: ReactNode }) {
  const session = await getSessionServer();
  // Nur Autor:innen und Admins dürfen ins Autorentool – Lehrpersonen explizit ausschließen
  if (!session?.user || (session.user.role !== 'author' && session.user.role !== 'admin')) {
    redirect('/login?error=not-author');
  }
  return <>{children}</>;
}

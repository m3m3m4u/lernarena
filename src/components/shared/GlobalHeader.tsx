"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useSession } from 'next-auth/react';

export default function GlobalHeader(){
  const pathname = usePathname();
  const { data: session } = useSession();
  const username = (session?.user as any)?.username || session?.user?.name || session?.user?.email || 'Gast';
  const role = (session?.user as any)?.role || 'anon';

  // Links kontextabhängig
  const leftLinks = [
    { href: '/lernen', label: 'Lernen' },
    { href: '/ueben', label: 'Üben' },
    { href: '/dashboard', label: 'Dashboard' },
  ];
  const teacherExtras = [
    { href: '/teacher', label: 'Lehrer' },
    { href: '/teacher/kurse', label: 'Kurse' },
    { href: '/teacher/statistik', label: 'Statistik' },
  ];
  const authorExtras = [ { href: '/autor', label: 'Autor' } ];
  const adminExtras = [ { href: '/admin/users', label: 'Admin' } ];

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <nav className="flex items-center gap-4 text-sm">
          {[...leftLinks,
            ...(role==='teacher' ? teacherExtras: []),
            ...(role==='author' ? authorExtras: []),
            ...(role==='admin' ? adminExtras: []),
          ].map(l=> (
            <Link key={l.href} href={l.href} className={`px-2 py-1 rounded hover:bg-gray-100 ${pathname===l.href? 'font-semibold text-blue-700':''}`}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-600">Eingeloggt als</span>
          <span className="px-2 py-1 bg-gray-100 rounded font-mono">{String(username)}</span>
          <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded uppercase text-xs tracking-wide">{String(role)}</span>
          {session ? (
            <button onClick={()=>signOut()} className="ml-2 px-2 py-1 border rounded hover:bg-gray-50">Logout</button>
          ) : (
            <Link href="/login" className="ml-2 px-2 py-1 border rounded hover:bg-gray-50">Login</Link>
          )}
        </div>
      </div>
    </header>
  );
}

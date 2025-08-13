"use client";
import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface DashboardUser {
  username: string;
  name?: string;
  stars?: number;
  completedLessons: string[];
  role?: string;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState<DashboardUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      if (!session?.user?.username) return;
      try {
        setLoadingUser(true);
        const res = await fetch("/api/user?username=" + encodeURIComponent(session.user.username));
        const data = await res.json();
        if (res.ok && data.user) {
          setUser(data.user as DashboardUser);
          setError(null);
        } else {
          setError(data.error || "Fehler beim Laden der Nutzerdaten");
        }
      } catch {
        setError("Netzwerkfehler");
      } finally {
        setLoadingUser(false);
      }
    };
    void fetchUser();
  }, [session?.user?.username]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return <div className="text-center mt-10">Lade...</div>;
  }
  if (status === 'unauthenticated') {
    return null; // Redirect läuft in useEffect
  }

  return (
    <main className="max-w-xl mx-auto mt-10 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Dein Profil</h2>
      <div className="flex gap-3 mb-4 flex-wrap">
        <button onClick={() => signOut()} className="bg-red-600 text-white py-2 px-4 rounded text-sm hover:bg-red-700">Logout</button>
      </div>
      {error && <div className="text-red-600 text-sm mb-4">{error}</div>}
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <a href="/lernen" className="bg-blue-600 text-white py-3 px-4 rounded text-center font-semibold hover:bg-blue-700 transition">
          📚 Lernen
        </a>
        <a href="/ueben" className="bg-green-600 text-white py-3 px-4 rounded text-center font-semibold hover:bg-green-700 transition">
          ✏️ Üben
        </a>
        <a href="/arena" className="bg-purple-600 text-white py-3 px-4 rounded text-center font-semibold hover:bg-purple-700 transition">
          🏆 Arena
        </a>
  {(['author','admin'] as string[]).includes((session?.user as any)?.role) && (
          <a href="/autor" className="bg-orange-600 text-white py-3 px-4 rounded text-center font-semibold hover:bg-orange-700 transition">🛠️ Autor</a>
        )}
        {(['teacher','admin'] as string[]).includes((session?.user as any)?.role) && (
          <a href="/teacher" className="bg-indigo-600 text-white py-3 px-4 rounded text-center font-semibold hover:bg-indigo-700 transition">👩‍🏫 Teacher</a>
        )}
  {(session?.user as any)?.role === 'admin' && (
          <a href="/admin/users" className="bg-red-600 text-white py-3 px-4 rounded text-center font-semibold hover:bg-red-700 transition">🔐 Admin</a>
        )}
      </div>

      {loadingUser && !user ? (
        <div>Lade Nutzerdaten...</div>
      ) : user ? (
        <>
          <div className="mb-6 space-y-1">
            <div><strong>Benutzername:</strong> {user.username}</div>
            <div><strong>Name:</strong> {user.name || '—'}</div>
            <div><strong>⭐ Sterne:</strong> {user.stars ?? 0}</div>
            <div><strong>Rolle:</strong> {(session?.user as any)?.role}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <strong>Abgeschlossene Lektionen:</strong>
              <span>{user.completedLessons?.length ?? 0}</span>
            </div>
            {(session?.user as any)?.role === 'pending-author' && (
              <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-300 rounded p-2 mt-2">Dein Autor-Zugang wartet auf Freischaltung.</div>
            )}
            {(session?.user as any)?.role === 'pending-teacher' && (
              <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-300 rounded p-2 mt-2">Dein Lehrpersonen-Zugang wartet auf Freischaltung.</div>
            )}
            {(!(session?.user as any)?.role || (session?.user as any)?.role==='learner') && (
              <AutorWerden />
            )}
          </div>
        </>
      ) : (
        <div>Keine Nutzerdaten vorhanden.</div>
      )}
    </main>
  );
}

function AutorWerden(){
  const [requested,setRequested] = useState(false);
  const [busy,setBusy]=useState(false);
  async function request(){
    setBusy(true);
    try{
      const res = await fetch('/api/user/request-author',{ method:'POST'});
      if(res.ok){ setRequested(true); }
    } finally { setBusy(false); }
  }
  if(requested) return <div className="text-xs text-green-700 bg-green-50 border border-green-300 rounded p-2 mt-2">Anfrage gesendet. Du erscheinst nun als pending-author.</div>;
  return <button disabled={busy} onClick={request} className="mt-3 text-xs px-3 py-1 border rounded bg-white hover:bg-gray-50 disabled:opacity-50">Autor werden (Anfrage)</button>;
}

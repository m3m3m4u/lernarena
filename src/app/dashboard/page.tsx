"use client";
import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface DashboardUser {
  username: string;
  name?: string;
  stars?: number;
  completedLessons: string[];
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
        {session?.user?.role === 'author' && (
          <a href="/autor" className="bg-orange-600 text-white py-3 px-4 rounded text-center font-semibold hover:bg-orange-700 transition">
            🛠️ Autor
          </a>
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
            <div className="flex items-center gap-2 flex-wrap">
              <strong>Abgeschlossene Lektionen:</strong>
              <span>{user.completedLessons?.length ?? 0}</span>
            </div>
          </div>
        </>
      ) : (
        <div>Keine Nutzerdaten vorhanden.</div>
      )}
    </main>
  );
}

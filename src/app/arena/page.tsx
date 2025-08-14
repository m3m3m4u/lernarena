"use client";

export default function ArenaPage() {
  let isGuest = false;
  if (typeof window !== 'undefined') {
    try { const p = new URLSearchParams(window.location.search); isGuest = p.get('guest')==='1' || localStorage.getItem('guest:active')==='1'; } catch {}
  }
  return (
    <main className="max-w-xl mx-auto mt-10 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">🏆 Arena</h2>
      <p className="mb-6 text-gray-700">Hier kannst du gegen andere Spieler antreten und deine Fähigkeiten messen.</p>
      {isGuest && (
        <div className="mb-4 text-xs text-yellow-800 bg-yellow-50 border border-yellow-300 rounded p-2">
          Gastmodus aktiv: Fortschritte werden nur lokal im Browser gespeichert.
        </div>
      )}
      
      <div className="mb-6">
        <p className="text-gray-500">Diese Seite ist noch in Entwicklung...</p>
      </div>
      
      <a href="/dashboard" className="bg-gray-600 text-white py-2 px-4 rounded font-semibold hover:bg-gray-700 transition">
        ← Zurück zur Startseite
      </a>
    </main>
  );
}

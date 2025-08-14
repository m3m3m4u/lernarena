"use client";

import { useEffect, useState, useCallback } from 'react';

interface Exercise { _id: string; title: string; type: string; courseId: string; createdAt?: string; }

export default function UebenPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/exercises');
      const data = await res.json();
      if (data.success) setExercises(data.exercises || []); else setError(data.error || 'Fehler');
    } catch { setError('Netzwerkfehler'); } finally { setLoading(false); }
  }, []);

  useEffect(()=>{ load(); }, [load]);

  return (
  <main className="max-w-6xl mx-auto mt-10 p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">✏️ Übungen</h2>
          <p className="text-gray-600">Freie Übungslektionen zur Wiederholung.</p>
        </div>
        <button onClick={load} className="px-3 py-1 text-sm border rounded bg-white hover:bg-gray-50">🔄 Aktualisieren</button>
      </div>
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 mb-4">{error}</div>}
      {loading ? <div className="text-gray-500">Lade…</div> : (
        exercises.length === 0 ? <div className="text-gray-500 text-sm">Noch keine Übungen vorhanden.</div> : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {exercises.map(ex => {
              const link = ex.courseId && ex.courseId !== 'exercise-pool' ? `/kurs/${ex.courseId}/lektion/${ex._id}` : `/kurs/${ex.courseId || 'exercise-pool'}/lektion/${ex._id}`;
              return (
                <a key={ex._id} href={link} className="border rounded p-4 bg-white hover:shadow-sm transition flex flex-col gap-2">
                  <h3 className="font-semibold truncate" title={ex.title}>{ex.title}</h3>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{ex.type}</span>
                    {ex.createdAt && <span>{new Date(ex.createdAt).toLocaleDateString('de-DE')}</span>}
                  </div>
                </a>
              );
            })}
          </div>
        )
      )}
      <div className="mt-10">
        <a href="/dashboard" className="text-blue-600 hover:underline text-sm">← Zurück zum Dashboard</a>
      </div>
    </main>
  );
}

"use client";
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';

interface CourseItem {
  _id: string;
  title: string;
  description?: string;
  lessonCount?: number;
}

type ProgressMap = Record<string, { completed: number; inProgress: number }>;

export default function LernenPage() {
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressMap>({});
  const { data: session } = useSession();

  // Fortschritt neu berechnen (merged global + lokal, gefiltert nach Kurs-Lektions-IDs)
  const recalcProgress = useCallback(async () => {
    if (!courses || courses.length === 0) return;
    const map: ProgressMap = {};

    try {
      const username = session?.user?.username as string | undefined;
      const hasUser = !!username;
      const globalCompleted: string[] = JSON.parse(localStorage.getItem('global:completedLessons') || '[]');

      if (hasUser && globalCompleted.length > 0) {
        // Hole Lektions-IDs je Kurs, um globale Completed den Kursen zuzuordnen
        const perCourseLessonIds = await Promise.all(
          courses.map(async (c) => {
            try {
              const res = await fetch(`/api/lessons?courseId=${c._id}`);
              if (!res.ok) return { id: c._id, ids: [] as string[] };
              const data = await res.json();
              const lessons = Array.isArray(data.lessons) ? data.lessons : [];
              return { id: c._id, ids: lessons.map((l: { _id?: string; id?: string }) => l._id || l.id).filter(Boolean) as string[] };
            } catch {
              return { id: c._id, ids: [] as string[] };
            }
          })
        );
        const idMap = new Map<string, Set<string>>(perCourseLessonIds.map(x => [x.id, new Set(x.ids)]));

        courses.forEach((c) => {
          const completedKey = `course:${c._id}:completedLessons`;
          const inProgKey = `course:${c._id}:inProgressLessons`;
          const localCompleted: string[] = JSON.parse(localStorage.getItem(completedKey) || '[]');
          const courseIds = idMap.get(c._id) || new Set<string>();
          const mergedCompleted = Array.from(new Set([
            ...localCompleted,
            ...globalCompleted.filter((id) => courseIds.has(id))
          ]));
          localStorage.setItem(completedKey, JSON.stringify(mergedCompleted));
          const inProgArr: string[] = JSON.parse(localStorage.getItem(inProgKey) || '[]');
          map[c._id] = {
            completed: mergedCompleted.length,
            inProgress: Array.isArray(inProgArr) ? inProgArr.filter(id => !mergedCompleted.includes(id)).length : 0
          };
        });
      } else {
        // Fallback: nur lokale Daten nutzen
        courses.forEach((c) => {
          try {
            const completedKey = `course:${c._id}:completedLessons`;
            const inProgKey = `course:${c._id}:inProgressLessons`;
            const localCompleted: string[] = JSON.parse(localStorage.getItem(completedKey) || '[]');
            const inProgArr: string[] = JSON.parse(localStorage.getItem(inProgKey) || '[]');
            map[c._id] = {
              completed: Array.isArray(localCompleted) ? localCompleted.length : 0,
              inProgress: Array.isArray(inProgArr) ? inProgArr.filter(id => !localCompleted.includes(id)).length : 0
            };
          } catch {
            map[c._id] = { completed: 0, inProgress: 0 };
          }
        });
      }
    } catch {
      // Ignorieren, Map ggf. teilweise gefüllt
    }

    setProgress(map);
  }, [courses, session?.user?.username]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/kurse'); // nur veröffentlichte
        const data = await res.json();
        if (res.ok && data.success) {
          setCourses(data.courses || []);
        } else {
          setError(data.error || 'Fehler beim Laden');
        }
      } catch {
        setError('Netzwerkfehler');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    // Falls eingeloggt: serverseitigen Fortschritt holen und in localStorage mergen
    const syncProgress = async () => {
      try {
        const username = session?.user?.username as string | undefined;
        if (!username) return;
        const res = await fetch(`/api/progress?username=${encodeURIComponent(username)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success || !Array.isArray(data.completedLessons)) return;
        localStorage.setItem('global:completedLessons', JSON.stringify(data.completedLessons));
        // Nach Sync sofort neu berechnen, sofern Kurse geladen
        await recalcProgress();
      } catch {}
    };
    void syncProgress();
  }, [session?.user?.username, recalcProgress]);

  // Bei Kurs-/Session-Änderung Fortschritt neu berechnen
  useEffect(() => {
    void recalcProgress();
  }, [courses, session?.user?.username, recalcProgress]);

  return (
    <main className="max-w-4xl mx-auto mt-10 p-6">
      <h2 className="text-2xl font-bold mb-6">📚 Verfügbare Kurse</h2>
      {loading && <div className="text-gray-500">Lade Kurse...</div>}
      {error && <div className="text-red-600 text-sm mb-4">{error}</div>}
      {!loading && !error && courses.length === 0 && (
        <div className="text-gray-500">Für dich sind aktuell keine Kurse freigeschaltet. Bitte wende dich an deine Lehrperson.</div>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        {courses.map(course => {
          const p = progress[course._id] || { completed: 0, inProgress: 0 };
          const lessonTotal = course.lessonCount || 0;
          const isDone = lessonTotal > 0 && p.completed === lessonTotal;
          const hasProgress = !isDone && (p.completed > 0 || p.inProgress > 0);
          const buttonLabel = isDone ? '✅ Abgeschlossen' : hasProgress ? '⏩ Weitermachen' : '▶️ Starten';
          const buttonColor = isDone ? 'bg-green-600 hover:bg-green-700' : hasProgress ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700';
          const fraction = lessonTotal > 0 ? `${p.completed}/${lessonTotal}` : '0/0';
          const barWidth = lessonTotal > 0 ? (p.completed / lessonTotal) * 100 : 0;
          return (
            <div key={course._id} className="bg-white rounded shadow p-6 border flex flex-col gap-3">
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-1 flex items-center gap-2">
                  {course.title}
                  {isDone && <span className="text-green-600 text-sm font-semibold">✓</span>}
                </h3>
                <p className="text-gray-700 mb-3 text-sm line-clamp-3">{course.description}</p>
                <div className="mb-2 flex items-center justify-between text-xs text-gray-600">
                  <span>{lessonTotal} Lektionen</span>
                  <span>{fraction}</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded overflow-hidden mb-3">
                  <div className={`${isDone ? 'bg-green-500' : 'bg-blue-500'} h-2 transition-all`} style={{ width: barWidth + '%' }}></div>
                </div>
              </div>
              <div className="flex justify-between items-center mt-auto">
                <span className="text-xs text-gray-500">
                  {isDone ? 'Alle Lektionen abgeschlossen' : hasProgress ? 'Fortschritt vorhanden' : 'Noch nicht begonnen'}
                </span>
                <a 
                  href={`/kurs/${course._id}`}
                  className={`${buttonColor} text-white px-4 py-2 rounded font-semibold transition text-sm`}
                >{buttonLabel}</a>
              </div>
            </div>
          );
        })}
      </div>
      <a href="/dashboard" className="inline-block mt-8 bg-gray-600 text-white py-2 px-4 rounded font-semibold hover:bg-gray-700 transition">← Zurück zum Dashboard</a>
    </main>
  );
}

"use client";
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';

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
  const role = (session?.user as any)?.role as string | undefined;

  // Lehrer-spezifisch: Tab & Klassen
  const isTeacher = role === 'teacher';
  const isAdmin = role === 'admin';
  const search = useSearchParams();
  const router = useRouter();
  const [isGuest, setIsGuest] = useState(false);
  useEffect(() => {
    try {
      const flag = (search?.get('guest') === '1') || (typeof window !== 'undefined' && localStorage.getItem('guest:active') === '1');
      setIsGuest(!!flag);
    } catch { setIsGuest(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  const [viewTab, setViewTab] = useState<'general' | 'class'>(() => (search?.get('view') === 'class' ? 'class' : 'general'));
  const [classes, setClasses] = useState<Array<{ _id: string; name: string; courses?: Array<{ course: CourseItem }>}> >([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>(() => search?.get('classId') || '');

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

  // Allgemeine Kurse laden (Standard)
  useEffect(() => {
    if (viewTab !== 'general') return;
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const res = await fetch('/api/kurse'); // nur veröffentlichte
        const data = await res.json();
        if (!cancelled) {
          if (res.ok && data.success) {
            setCourses(data.courses || []);
          } else {
            setError(data.error || 'Fehler beim Laden');
          }
        }
      } catch {
        if (!cancelled) setError('Netzwerkfehler');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [viewTab]);

  // Klassenliste laden (nur Lehrer) – unabhängig vom Tab, damit Auswahl immer verfügbar ist
  useEffect(() => {
  if (!isTeacher || isGuest) return;
    let cancelled = false;
    const load = async () => {
      setLoadingClasses(true);
      try {
        const res = await fetch('/api/teacher/courses/manage');
        const d = await res.json().catch(() => ({}));
        if (!cancelled) {
          if (res.ok && d?.success) {
            const cls = (d.classes || []) as Array<{ _id: string; name: string; courses?: Array<{ course: CourseItem }> }>;
            setClasses(cls);
            if (!selectedClassId) setSelectedClassId(cls[0]?._id || '');
          } else {
            setError(d?.error || 'Fehler beim Laden der Klassen');
            setClasses([]);
          }
        }
      } catch {
        if (!cancelled) { setError('Netzwerkfehler'); setClasses([]); }
      } finally {
        if (!cancelled) { setLoadingClasses(false); }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [isTeacher]);

  // Wechsel der Klasse aktualisiert Kurse (nur im Klassen-Tab)
  useEffect(() => {
  if (!isTeacher || isGuest || viewTab !== 'class') return;
    const selected = classes.find(c => String(c._id) === String(selectedClassId));
    const mapped = (selected?.courses || []).map((x:any) => ({
      _id: x?.course?._id,
      title: x?.course?.title,
      description: x?.course?.description,
      lessonCount: (x?.course as any)?.lessonCount
    })).filter((c:CourseItem) => !!c._id && !!c.title);
    setCourses(mapped);
  }, [selectedClassId, classes, isTeacher, viewTab]);

  // URL-Query aktualisieren wenn Tab/Classe geändert
  useEffect(() => {
  if(!isTeacher || isGuest) return;
    const q = new URLSearchParams(Array.from(search?.entries?.()||[]));
    q.set('view', viewTab);
    if(selectedClassId) q.set('classId', selectedClassId); else q.delete('classId');
    router.replace(`?${q.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewTab, selectedClassId]);

  useEffect(() => {
    // Falls eingeloggt: serverseitigen Fortschritt holen und in localStorage mergen
  const syncProgress = async () => {
      try {
    const username = isGuest ? undefined : (session?.user?.username as string | undefined);
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
  }, [session?.user?.username, recalcProgress, isGuest]);

  // Bei Kurs-/Session-Änderung Fortschritt neu berechnen
  useEffect(() => {
    void recalcProgress();
  }, [courses, session?.user?.username, recalcProgress]);

  return (
    <main className="max-w-6xl mx-auto mt-10 p-6">
      {isTeacher ? (
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4 text-sm">
            <button onClick={()=>setViewTab('general')} className={"px-3 py-1.5 rounded border " + (viewTab==='general' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50')}>Allgemeiner Lernbereich</button>
            <button onClick={()=>setViewTab('class')} className={"px-3 py-1.5 rounded border " + (viewTab==='class' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50')}>Klassenspezifisch</button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-gray-600">Klasse:</label>
            <select value={selectedClassId} onChange={e=>setSelectedClassId(e.target.value)} className="border rounded px-2 py-1">
              {classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            {loadingClasses && <span className="text-xs text-gray-500">Lade…</span>}
          </div>
        </div>
      ) : (
        <div className="mb-6 text-sm text-gray-600 flex items-center gap-2">
          <span className="px-2 py-1 rounded border bg-blue-600 text-white">Allgemeiner Bereich</span>
          {!isAdmin && (
            <span className="px-2 py-1 rounded border bg-gray-100 text-gray-700">Klassenbereich</span>
          )}
        </div>
      )}
      <h2 className="text-2xl font-bold mb-2">📚 Verfügbare Kurse</h2>
      {isGuest && (
        <div className="mb-4 text-xs text-yellow-800 bg-yellow-50 border border-yellow-300 rounded p-2">
          Gastmodus aktiv: Fortschritte werden nur lokal im Browser gespeichert.
        </div>
      )}
      {loading && <div className="text-gray-500">Lade Kurse...</div>}
      {error && <div className="text-red-600 text-sm mb-4">{error}</div>}
      {!loading && !error && courses.length === 0 && (
        <div className="text-gray-500">{isTeacher && viewTab==='class' ? 'Für diese Klasse sind keine Kurse freigeschaltet.' : 'Für dich sind aktuell keine Kurse freigeschaltet.'}</div>
      )}
  <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
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
  <a href="/dashboard" className="inline-block mt-8 bg-gray-600 text-white py-2 px-4 rounded font-semibold hover:bg-gray-700 transition">← Zurück zur Startseite</a>
    </main>
  );
}

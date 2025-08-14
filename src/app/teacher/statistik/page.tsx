"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type TeacherClass = { _id: string; name: string };
type CourseInfo = { _id: string; title: string; totalLessons: number };
type LearnerRow = {
  username: string;
  name: string;
  email: string | null;
  stars: number;
  completedTotal: number;
  perCourse: Record<string, { completed: number; total: number; percent: number }>;
};

export default function TeacherStatisticsPage(){
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [learners, setLearners] = useState<LearnerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(()=>{
    // Klassen-Liste laden
    (async()=>{
      try{
        const res = await fetch('/api/teacher/courses/manage');
        const d = await res.json();
        if(res.ok && d.success){
          const list: TeacherClass[] = (d.classes||[]).map((c:any)=>({ _id: c._id, name: c.name }));
          setClasses(list);
          if(list.length && !selectedClass){ setSelectedClass(list[0]._id); }
        } else {
          setError(d.error || 'Fehler beim Laden der Klassen');
        }
      } catch(e:any){ setError('Netzwerkfehler beim Laden der Klassen'); }
    })();
  },[]);

  useEffect(()=>{
    if(!selectedClass) return;
    setLoading(true);
    setError(null);
    (async()=>{
      try{
        const res = await fetch(`/api/teacher/statistics?classId=${encodeURIComponent(selectedClass)}`);
        const d = await res.json();
        if(res.ok && d.success){
          setCourses(d.courses||[]);
          setLearners(d.learners||[]);
        } else {
          setError(d.error || 'Fehler beim Laden der Statistik');
        }
      } catch(e:any){ setError('Netzwerkfehler beim Laden der Statistik'); }
      finally { setLoading(false); }
    })();
  },[selectedClass]);

  const columns = useMemo(()=>{
    return [
      { key: 'name', label: 'Lernende/r' },
      ...courses.map(c=>({ key: `course:${c._id}`, label: `${c.title} (${c.totalLessons})` })),
      { key: 'stars', label: '⭐ Sterne' },
      { key: 'completed', label: '✔️ gesamt' },
    ];
  },[courses]);

  return (
    <main className="max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Statistik</h1>
        <div className="flex gap-2">
          <button onClick={()=>router.push('/teacher')} className="px-3 py-2 border rounded hover:bg-gray-50">← Zurück</button>
        </div>
      </div>

      <div className="bg-white border rounded p-4 mb-4">
        <label className="block text-sm font-medium mb-2">Klasse wählen</label>
        <select value={selectedClass} onChange={e=>setSelectedClass(e.target.value)} className="border rounded px-3 py-2 min-w-[280px]">
          <option value="">– Klasse auswählen –</option>
          {classes.map(c=> (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </select>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded mb-4">{error}</div>}

      <div className="bg-white border rounded overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {columns.map(col=> (
                <th key={col.key} className="text-left px-4 py-2 border-b font-semibold whitespace-nowrap">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-gray-500">Lade Daten…</td></tr>
            ) : learners.length===0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-gray-500">Keine Lernenden in dieser Klasse.</td></tr>
            ) : (
              learners.map(l => (
                <tr key={l.username} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="font-medium">{l.name}</div>
                    <div className="text-gray-500 text-xs">@{l.username}{l.email? ` • ${l.email}`:''}</div>
                  </td>
                  {courses.map(c=>{
                    const cell = l.perCourse?.[c._id] || { completed:0, total:c.totalLessons, percent:0 };
                    return (
                      <td key={c._id} className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-gray-200 rounded overflow-hidden">
                            <div className="h-2 bg-green-500" style={{ width: `${Math.min(100, Math.max(0, cell.percent))}%` }} />
                          </div>
                          <span className="tabular-nums">{cell.completed}/{cell.total}</span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 whitespace-nowrap">{l.stars}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{l.completedTotal}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

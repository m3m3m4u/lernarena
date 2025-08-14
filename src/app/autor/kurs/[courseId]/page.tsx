"use client";
import { useState, useEffect, useCallback } from "react";
import type { ComponentType } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { useSession } from 'next-auth/react';
import { useToast } from '@/components/shared/ToastProvider';

// Leichte Typen für Kurs und Lektionen in dieser Seite
type Course = {
  _id?: string;
  id?: string;
  title: string;
  description?: string;
  category?: string;
  author?: string;
  isPublished?: boolean;
};

type LessonQuestion = {
  question: string;
  mediaLink?: string;
  correctAnswer?: string;
  correctAnswers?: string[];
  allAnswers?: string[];
};

type LessonListItem = {
  _id?: string;
  id?: string;
  title: string;
  description?: string;
  type: "single-choice" | "multiple-choice" | "text" | "video" | "markdown" | "matching" | string;
  questions?: LessonQuestion[];
  createdAt?: string;
  addedAt?: string;
  content?: { markdown?: string; title?: string } | null;
  courseIds?: string[];
  // Legacy-Unterstützung ohne any
  courseId?: string;
};

export default function KursBearbeitenPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const courseId = params.courseId as string;
  const inTeacherContext = pathname?.startsWith('/teacher/');
  const role = (session?.user as any)?.role as string | undefined;
  const homePath = inTeacherContext ? '/teacher/kurse?tab=freigaben' : '/autor';
  const backLabel = inTeacherContext ? '← Zurück zu „Kurse zuordnen“' : '← Zurück zum Autorentool';
  
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "create-lesson" | "existing-lessons">("overview");
  const [actualLessonsCount, setActualLessonsCount] = useState(0);

  const loadActualLessonsCount = useCallback(async () => {
    try {
      const response = await fetch(`/api/lessons?courseId=${courseId}`);
      if (response.ok) {
        const lessonsData = await response.json();
        const realLessons: LessonListItem[] = lessonsData.lessons || [];
        setActualLessonsCount(realLessons.length);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Lektions-Anzahl:', error);
    }
  }, [courseId]);

  const loadCourse = useCallback(async () => {
    try {
      // Lade echte Kursdaten aus MongoDB
      const response = await fetch(`/api/kurs/${courseId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCourse(data.course as Course);
        } else {
          console.error('Kurs nicht gefunden');
          router.push(homePath);
        }
      } else {
        console.error('Fehler beim Laden des Kurses');
        router.push(homePath);
      }
    } catch (error) {
      console.error("Fehler beim Laden des Kurses:", error);
      router.push(homePath);
    } finally {
      setLoading(false);
    }
  }, [courseId, router, homePath]);

  useEffect(() => {
    loadCourse();
    loadActualLessonsCount();
  }, [loadCourse, loadActualLessonsCount]);

  const handleDeleteLesson = async (lessonId: string) => {
    if (confirm("Lektion wirklich löschen?")) {
      try {
        const response = await fetch(`/api/lessons/${lessonId}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          // Lade die Lektionen neu
          loadActualLessonsCount();
          alert('Lektion erfolgreich gelöscht!');
        } else {
          alert('Fehler beim Löschen der Lektion');
        }
      } catch (error) {
        console.error('Fehler beim Löschen:', error);
        alert('Fehler beim Löschen der Lektion');
      }
    }
  };

  const handlePublishCourse = async () => {
    if (!confirm("Kurs jetzt veröffentlichen?")) return;
    try {
      const res = await fetch(`/api/kurs/${courseId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ publish: true }) });
      if(res.ok){
        setCourse(prev => (prev ? { ...prev, isPublished: true } : prev));
        alert('Kurs veröffentlicht (gespeichert).');
      } else {
        alert('Veröffentlichen fehlgeschlagen');
      }
    } catch {
      alert('Netzwerkfehler beim Veröffentlichen');
    }
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto mt-10 p-6 text-center">Lade Kurs...</div>;
  }

  return (
    <main className="max-w-6xl mx-auto mt-10 p-6">
      <div className="mb-6">
  <a href={homePath} className="text-blue-600 hover:underline">{backLabel}</a>
      </div>

      {/* Kurs Header */}
      <div className="bg-white border rounded p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold mb-2">{course?.title}</h1>
            <p className="text-gray-600 mb-4">{course?.description}</p>
            <div className="flex gap-4 text-sm text-gray-500">
              <span>📚 {course?.category}</span>
              <span>👤 {course?.author}</span>
              <span className={course?.isPublished ? "text-green-600" : "text-orange-600"}>
                {course?.isPublished ? "✅ Veröffentlicht" : "📝 Entwurf"}
              </span>
            </div>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => router.push(inTeacherContext ? `/teacher/kurs/${courseId}/einstellungen` : `/autor/kurs/${courseId}/einstellungen`)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              ⚙️ Einstellungen
            </button>
            {!course?.isPublished && role!=='teacher' && (
              <button 
                onClick={handlePublishCourse}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                🚀 Veröffentlichen
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border rounded">
        <div className="border-b">
          <div className="flex">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-6 py-3 font-medium ${
                activeTab === "overview" 
                  ? "border-b-2 border-blue-500 text-blue-600" 
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              📋 Lektionen ({actualLessonsCount})
            </button>
            <button
              onClick={() => setActiveTab("create-lesson")}
              className={`px-6 py-3 font-medium ${
                activeTab === "create-lesson" 
                  ? "border-b-2 border-blue-500 text-blue-600" 
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              ➕ Neue Lektion
            </button>
            <button
              onClick={() => setActiveTab("existing-lessons")}
              className={`px-6 py-3 font-medium ${
                activeTab === "existing-lessons" 
                  ? "border-b-2 border-blue-500 text-blue-600" 
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              📚 Vorhandene einfügen
            </button>
            {/* Übungen-Tab entfernt (nur noch Lektionen verwaltbar) */}
          </div>
        </div>

        <div className="p-6">
          {activeTab === "overview" && <LessonsOverviewTab courseId={courseId} onDelete={handleDeleteLesson} onLessonsCountChange={setActualLessonsCount} />}
          {activeTab === "create-lesson" && <CreateLessonTab courseId={courseId} onLessonCreated={loadActualLessonsCount} />}
          {activeTab === "existing-lessons" && <ExistingLessonsTab courseId={courseId} onLessonAdded={loadActualLessonsCount} />}
          {/* ExercisesTab entfernt */}
        </div>
      </div>
    </main>
  );
}

// ExercisesTab / MarkAsExercisePanel entfernt

// Lektionen Übersicht Tab
function LessonsOverviewTab({ courseId, onDelete, onLessonsCountChange }: { courseId: string; onDelete: (id: string) => void; onLessonsCountChange: (count: number) => void; }) {
  const router = useRouter();
  const pathname = usePathname();
  const inTeacherContext = pathname?.startsWith('/teacher/');
  const [courseLessons, setCourseLessons] = useState<LessonListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Vorschau-States lokal für diesen Tab
  const [showPreview, setShowPreview] = useState(false);
  const [previewLesson, setPreviewLesson] = useState<LessonListItem | null>(null);
  // Kategorie-Inline-Editing entfernt – Kategorie nur noch im Bearbeiten-Screen änderbar
  const [reorderMode, setReorderMode] = useState(false);
  const [localOrder, setLocalOrder] = useState<string[]>([]);
  const moveLesson = (id: string, dir: number) => {
    setLocalOrder(prev => {
      const arr = [...prev];
      const idx = arr.indexOf(id);
      if (idx === -1) return prev;
      const ni = idx + dir;
      if (ni < 0 || ni >= arr.length) return prev;
      const tmp = arr[idx]; arr[idx] = arr[ni]; arr[ni] = tmp;
      return arr;
    });
  };
  const applyReorder = async () => {
    try {
      const res = await fetch(`/api/kurs/${courseId}/lektionen/reorder`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ order: localOrder }) });
      if(!res.ok){ alert('Reihenfolge speichern fehlgeschlagen'); return; }
      // lokale Reihenfolge in courseLessons widerspiegeln
      setCourseLessons(prev => {
        const map = new Map(prev.map(l=>[l._id||l.id,l] as const));
        return localOrder.map(id => map.get(id)!).filter(Boolean);
      });
      setReorderMode(false);
    } catch { alert('Netzwerkfehler beim Speichern'); }
  };

  const loadCourseLessons = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/kurs/${courseId}/lektionen`);
      
      if (response.ok) {
        const lessonsData = await response.json();
        
        // Unterstütze sowohl das neue Format (direktes Array) als auch das alte Format (mit success/lessons)
        let lessons: LessonListItem[] = [];
        if (Array.isArray(lessonsData)) {
          lessons = lessonsData as LessonListItem[];
        } else if (lessonsData.success && lessonsData.lessons) {
          lessons = lessonsData.lessons as LessonListItem[];
        }
        
        setCourseLessons(lessons);
        // Anzahl an Parent-Component weitergeben
        onLessonsCountChange(lessons.length);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Lektionen:', error);
    } finally {
      setIsLoading(false);
    }
  }, [courseId, onLessonsCountChange]);

  useEffect(() => {
    loadCourseLessons();
  }, [loadCourseLessons]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Kurs-Lektionen {reorderMode && <span className="text-sm text-blue-600 ml-2">(Reihenfolge bearbeiten)</span>}</h2>
        <div className="flex gap-2">
          <button
            onClick={()=>{
              if(!reorderMode){
                setLocalOrder(courseLessons.map(l=> (l._id||l.id)!));
                setReorderMode(true);
              } else {
                setReorderMode(false);
              }
            }}
            className={`px-3 py-1 rounded text-sm border ${reorderMode? 'bg-yellow-100 border-yellow-300':'bg-white hover:bg-gray-50'}`}
          >{reorderMode? '✖ Abbrechen':'↕ Reihenfolge'}</button>
          {reorderMode && (
            <button onClick={applyReorder} className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">💾 Reihenfolge speichern</button>
          )}
          <button 
            onClick={async () => {
              if (confirm("Wirklich ALLE Lektionen löschen? Diese Aktion kann nicht rückgängig gemacht werden!")) {
                try {
                  await fetch('/api/debug/clear-lessons', { method: 'DELETE' });
                  loadCourseLessons();
                  alert('Alle Lektionen wurden gelöscht!');
                } catch {
                  alert('Fehler beim Löschen der Lektionen');
                }
              }
            }}
            className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
          >
            🗑️ Alle löschen
          </button>
          <button 
            onClick={loadCourseLessons}
            className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
            disabled={isLoading}
          >
            {isLoading ? '⏳ Laden...' : '🔄 Aktualisieren'}
          </button>
        </div>
      </div>

      {courseLessons.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-4">📚</div>
          <p>Noch keine Lektionen in diesem Kurs.</p>
          <p className="text-sm mt-2">Erstelle deine erste Lektion über &quot;Neue Lektion&quot; oder füge vorhandene Lektionen hinzu.</p>
        </div>
      ) : (
        <div className="space-y-4">
          { (reorderMode ? localOrder.map(id => courseLessons.find(l=> (l._id||l.id)===id)!).filter(Boolean) : courseLessons).map((lesson, index) => (
            <div key={lesson._id || lesson.id} className="border rounded p-4 bg-white flex flex-col gap-2">
              {reorderMode && (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={()=>moveLesson((lesson._id||lesson.id)!, -1)}
                    disabled={index===0}
                    className={`px-2 py-1 border rounded ${index===0? 'opacity-40 cursor-not-allowed':'hover:bg-gray-50'}`}>↑</button>
                  <button
                    onClick={()=>moveLesson((lesson._id||lesson.id)!, 1)}
                    disabled={index===localOrder.length-1}
                    className={`px-2 py-1 border rounded ${index===localOrder.length-1? 'opacity-40 cursor-not-allowed':'hover:bg-gray-50'}`}>↓</button>
                  <span className="font-mono text-gray-500">Pos: {index+1}</span>
                </div>
              )}
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-100 rounded px-3 py-1 text-sm font-medium text-blue-800">
                    #{index + 1}
                  </div>
                  <div>
                    <h3 className="font-semibold">{lesson.title}</h3>
                    <p className="text-sm text-gray-600 mb-1">
                      {lesson.description ||
                       (lesson.questions && `${lesson.questions.length} Fragen`) ||
                       (lesson.type === 'markdown' ? 'Markdown-Text' : 'Single Choice Quiz')}
                    </p>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-600 items-center">
                      <span>{getLessonTypeIcon(lesson.type)} {getLessonTypeName(lesson.type)}</span>
                      <span>📅 {new Date(lesson.createdAt || lesson.addedAt || Date.now()).toLocaleDateString('de-DE')}</span>
                      {lesson.questions && (
                        <span>❓ {lesson.questions.length} Fragen</span>
                      )}
                      <span className="flex items-center gap-1">🏷️ {(lesson as any).category || '–'}</span>
                    </div>
                  </div>
                </div>
                {!reorderMode && <div className="flex gap-2">
                  <button 
                      onClick={() => router.push(inTeacherContext ? `/teacher/lektion/${lesson._id || lesson.id}` : `/autor/lektion/${lesson._id || lesson.id}`)}
                      className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                    >
                      ✏️ Bearbeiten
                    </button>
                  {!inTeacherContext && (
                    <button 
                      onClick={() => {
                        setPreviewLesson(lesson);
                        setShowPreview(true);
                      }}
                      className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700"
                    >
                      👁️ Vorschau
                    </button>
                  )}
                  <button 
                    onClick={() => onDelete(lesson._id || lesson.id || "")}
                    className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                  >
                    🗑️ Löschen
                  </button>
                </div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Vorschau-Modal */}
      {showPreview && previewLesson && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg p-6 max-w-2xl w-full relative">
            <div className="absolute top-2 right-2 flex gap-2">
              <button
                onClick={() => {
                  // Wenn diese Lektion aus exercise-pool stammt -> eigener Zurück-Link zu Übungen
                  if ((previewLesson as any)?.courseId === 'exercise-pool') {
                    setShowPreview(false);
                  } else {
                    setShowPreview(false);
                  }
                }}
                className="text-gray-500 hover:text-gray-800"
              >✖</button>
            </div>
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-bold">Vorschau: {previewLesson.title}</h2>
              {(previewLesson as any)?.courseId === 'exercise-pool' && (
                <button
                  onClick={()=>{ setShowPreview(false); /* Zurück-Route kontextbewusst */ router.push(inTeacherContext ? '/teacher' : '/autor?tab=uebungen'); }}
                  className="text-blue-600 text-sm hover:underline"
                >← Zurück zu den Übungen</button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => {
                  // Reine Vorschau – nichts weiter nötig; Button dient nur der Klarheit
                  alert('Dies ist bereits die Vorschau dieser Übung.');
                }}
                className="px-3 py-1 text-sm border rounded bg-gray-50 hover:bg-gray-100"
              >👁️ Vorschau</button>
              <button
                onClick={async () => {
                  if(!previewLesson) return;
                  try {
                    // Duplizieren: POST auf Lektionen mit sourceLessonId oder vollständigem Payload (Fallback)
                    const payload: any = { sourceLessonId: previewLesson._id || previewLesson.id };
                    // Fallback falls Backend sourceLessonId nicht unterstützt: Minimales Datenobjekt mitsenden
                    if(!payload.sourceLessonId){
                      payload.title = previewLesson.title + ' (Kopie)';
                      payload.type = previewLesson.type;
                      if(previewLesson.questions) payload.questions = previewLesson.questions;
                      if(previewLesson.content) payload.content = previewLesson.content;
                      (payload as any).category = (previewLesson as any).category;
                    }
                    const res = await fetch(`/api/kurs/${courseId}/lektionen`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
                    if(res.ok){
                      // Neu laden & direkt in Bearbeitung wechseln
                      await loadCourseLessons();
                      const created = await res.json().catch(()=>null);
                      const newId = created?.lesson?._id || created?.lesson?.id || created?._id || null;
                      setShowPreview(false);
                      setTimeout(()=>{
                        if(newId){
                          router.push(inTeacherContext ? `/teacher/lektion/${newId}` : `/autor/lektion/${newId}`);
                        } else {
                          alert('Kopie erstellt (ID unbekannt) – bitte Seite aktualisieren.');
                        }
                      }, 200);
                    } else {
                      alert('Duplizieren fehlgeschlagen');
                    }
                  } catch {
                    alert('Netzwerkfehler beim Duplizieren');
                  }
                }}
                className="px-3 py-1 text-sm border rounded bg-blue-600 text-white hover:bg-blue-700"
              >📄 Duplizieren & Bearbeiten</button>
              <button
                onClick={()=>{
                  if(!previewLesson) return;
                  setShowPreview(false);
                  router.push(inTeacherContext ? `/teacher/lektion/${previewLesson._id || previewLesson.id}` : `/autor/lektion/${previewLesson._id || previewLesson.id}`);
                }}
                className="px-3 py-1 text-sm border rounded bg-green-600 text-white hover:bg-green-700"
              >✏️ Bearbeiten</button>
            </div>
            {previewLesson.type === 'matching' && Array.isArray(previewLesson.questions) && previewLesson.questions.length > 0 ? (
              <div>
                <div className="text-sm text-gray-600 mb-3">🔗 Paare verbinden (max. 5 pro Aufgabe)</div>
                <div className="space-y-4">
                  {previewLesson.questions!.map((q, qi) => {
                    const pairs = (q.correctAnswers || []).map((k) => {
                      const [l, r] = String(k).split('=>');
                      return { l: (l || '').trim(), r: (r || '').trim() };
                    }).filter(p => p.l && p.r);
                    return (
                      <div key={qi} className="border rounded p-3">
                        <div className="font-medium mb-2">Aufgabe {qi + 1}</div>
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <h4 className="font-medium mb-2">Links</h4>
                            <ul className="space-y-2">
                              {pairs.map((p, idx) => (
                                <li key={`l-${qi}-${idx}`} className="p-2 border rounded bg-gray-50">{p.l}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="font-medium mb-2">Rechts</h4>
                            <ul className="space-y-2">
                              {pairs.map((p, idx) => (
                                <li key={`r-${qi}-${idx}`} className="p-2 border rounded bg-gray-50">{p.r}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : ((previewLesson.type === 'single-choice' || previewLesson.type === 'multiple-choice') && Array.isArray(previewLesson.questions) && previewLesson.questions.length > 0) ? (
              <div className="space-y-4">
                {previewLesson.questions.map((q: LessonQuestion, i: number) => (
                  <div key={i} className="border rounded p-3">
                    <div className="font-semibold mb-2">Frage {i + 1}: {q.question}</div>

                    {/* Medien-Vorschau: Bild, Audio oder generischer Link */}
                    {q.mediaLink && (
                      <div className="mb-3">
                        {q.mediaLink.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={q.mediaLink}
                            alt="Fragen-Medien"
                            className="max-h-60 rounded border"
                            onError={(e) => {
                              const parent = (e.target as HTMLImageElement).parentElement;
                              if (parent) {
                                parent.innerHTML = `<p class=\"text-red-600 text-sm\">❌ Bild konnte nicht geladen werden: ${q.mediaLink}</p>`;
                              }
                            }}
                          />
                        ) : q.mediaLink.match(/\.(mp3|wav|ogg|m4a)$/i) ? (
                          <audio controls className="w-full">
                            <source src={q.mediaLink} />
                            Dein Browser unterstützt das Audio-Element nicht.
                            <a
                              href={q.mediaLink}
                              target="_blank"
                              rel="noreferrer"
                              className="underline text-blue-600 ml-1"
                            >
                              Audio öffnen
                            </a>
                          </audio>
                        ) : (
                          <a
                            href={q.mediaLink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 underline break-all"
                          >
                            📎 {q.mediaLink}
                          </a>
                        )}
                      </div>
                    )}

                    <div className="space-y-1">
                      {q.allAnswers?.map((a: string, idx: number) => (
                        <div
                          key={idx}
                          className={`p-2 rounded border ${(q.correctAnswer === a || (q.correctAnswers?.includes?.(a))) ? 'bg-green-50 border-green-400' : 'bg-gray-50 border-gray-300'}`}
                        >
                          {a} {(q.correctAnswer === a || (q.correctAnswers?.includes?.(a))) && <span className="text-green-600 ml-2">✓</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : previewLesson.type === 'text-answer' ? (
              <div>
                {(() => { const c:any = previewLesson.content || {}; const blocks = Array.isArray(c.blocks)? c.blocks.filter((b:any)=>b && b.question && Array.isArray(b.answers) && b.answers.length>0).slice(0,50): []; if(!blocks.length){ const q = c.question; const a = c.answer; if(q && a) blocks.push({ question:q, answers:[a] }); }
                  if(!blocks.length) return <div className="text-gray-400 text-sm">Keine Blöcke vorhanden.</div>;
                  return (
                    <div className="space-y-3 max-h-96 overflow-auto pr-1">
                      {blocks.map((b:any,i:number)=>(
                        <div key={i} className="border rounded p-3 bg-gray-50">
                          <div className="font-medium text-sm flex items-center gap-2">{i+1}. {b.question}{b.media && <span className="text-[10px] text-blue-600 break-all">📎 {b.media}</span>}</div>
                          <div className="mt-1 flex flex-wrap gap-1 text-xs">
                            {b.answers.map((ans:string)=><code key={ans} className="bg-white border rounded px-1">{ans}</code>)}
                          </div>
                        </div>
                      ))}
                      <div className="text-[10px] text-gray-500 flex gap-4 flex-wrap pt-1 border-t mt-2">
                        <span>Fragen: {blocks.length}</span>
                        {c.caseSensitive && <span>Case-Sensitive</span>}
                        {c.allowReveal && <span>Reveal erlaubt</span>}
                      </div>
                    </div>
                  ); })()}
              </div>
            ) : previewLesson.type === 'video' ? (
              <div className="space-y-4">
                {(() => { const cAny:any = previewLesson.content as any; const raw = String(cAny?.youtubeUrl || cAny?.url || cAny?.link || ''); const id = extractYouTubeIdPreview(raw); return id ? (
                  <div className="aspect-video w-full bg-black rounded overflow-hidden">
                    <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${id}`} title="YouTube Vorschau" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" />
                  </div>
                ) : <div className="text-sm text-gray-500">Kein (gültiger) YouTube-Link gespeichert.</div>; })()}
                {previewLesson.content && (previewLesson.content as any).text ? (
                  <div className="prose max-w-none text-sm bg-gray-50 border rounded p-3 overflow-auto max-h-64">
                    {(previewLesson.content as any).text}
                  </div>
                ) : <div className="text-xs text-gray-400">Kein Begleittext.</div>}
              </div>
            ) : previewLesson.type === 'memory' ? (
              <div>
                <div className="text-sm text-gray-600 mb-3">🧠 Memory Paare</div>
                {(() => { const c:any = previewLesson.content || {}; const pairs = Array.isArray(c.pairs)? c.pairs : []; if(!pairs.length) return <div className="text-gray-400 text-sm">Keine Paare gespeichert.</div>; return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {pairs.map((p:any,idx:number)=>(
                      <div key={idx} className="border rounded p-2 bg-gray-50 text-xs flex flex-col gap-1">
                        <MemoryPreviewSide side={p.a} />
                        <div className="text-center text-gray-400 text-[10px]">↕</div>
                        <MemoryPreviewSide side={p.b} />
                      </div>
                    ))}
                  </div>
                ); })()}
              </div>
            ) : previewLesson.type === 'lueckentext' ? (
              <div>
                <div className="text-sm text-gray-600 mb-3">🧩 Lückentext</div>
                {(() => { const c:any = previewLesson.content || {}; const masked = String(c.markdownMasked || ''); const gaps = Array.isArray(c.gaps)? c.gaps: []; if(!masked) return <div className="text-gray-400 text-sm">Kein Text.</div>; return (
                  <div className="space-y-4">
                    <div className="prose max-w-none border rounded p-3 bg-gray-50 text-sm whitespace-pre-wrap">{masked}</div>
                    {gaps.length>0 && <div className="flex flex-wrap gap-2 text-xs">{gaps.map((g:any)=><span key={g.id} className="px-2 py-1 border rounded bg-white">{g.id}:{g.answer}</span>)}</div>}
                    <div className="text-xs text-gray-500">Modus: <strong>{c.mode==='drag'?'Drag & Drop':'Eingabe'}</strong></div>
                  </div>
                ); })()}
              </div>
            ) : previewLesson.type === 'ordering' ? (
              <div>
                <div className="text-sm text-gray-600 mb-3">🔢 Reihenfolge</div>
                {(() => { const c:any = previewLesson.content || {}; const items = Array.isArray(c.items)? c.items: (typeof c.raw === 'string' ? c.raw.split(/\n/).map((l:string)=>l.trim()).filter((l:string)=>l) : []); if(!items.length) return <div className="text-gray-400 text-sm">Keine Schritte gespeichert.</div>; return (
                  <ol className="list-decimal pl-5 space-y-1 text-sm bg-gray-50 border rounded p-3">
                    {items.map((it:string,i:number)=><li key={i}>{it}</li>)}
                  </ol>
                ); })()}
              </div>
            ) : previewLesson.type === 'text-answer' ? (
              <div>
                {(() => { const c:any = previewLesson.content || {}; const blocks = Array.isArray(c.blocks)? c.blocks.filter((b:any)=>b && b.question && Array.isArray(b.answers) && b.answers.length>0).slice(0,50): []; if(!blocks.length){ const q = c.question; const a = c.answer; if(q && a) blocks.push({ question:q, answers:[a] }); }
                  if(!blocks.length) return <div className="text-gray-400 text-sm">Keine Blöcke vorhanden.</div>;
                  return (
                    <div className="space-y-3 max-h-96 overflow-auto pr-1">
                      {blocks.map((b:any,i:number)=>(
                        <div key={i} className="border rounded p-3 bg-gray-50">
                          <div className="font-medium text-sm flex items-center gap-2">{i+1}. {b.question}{b.media && <span className="text-[10px] text-blue-600 break-all">📎 {b.media}</span>}</div>
                          <div className="mt-1 flex flex-wrap gap-1 text-xs">
                            {b.answers.map((ans:string)=><code key={ans} className="bg-white border rounded px-1">{ans}</code>)}
                          </div>
                        </div>
                      ))}
                      <div className="text-[10px] text-gray-500 flex gap-4 flex-wrap pt-1 border-t mt-2">
                        <span>Fragen: {blocks.length}</span>
                        {c.caseSensitive && <span>Case-Sensitive</span>}
                        {c.allowReveal && <span>Reveal erlaubt</span>}
                      </div>
                    </div>
                  ); })()}
              </div>
            ) : (
              <div className="text-gray-600 prose max-w-none">
                {previewLesson?.content?.markdown ? (
                  <MarkdownInline markdown={previewLesson.content.markdown.slice(0, 400) + (previewLesson.content.markdown.length > 400 ? '…' : '')} />
                ) : (
                  <span>{previewLesson?.content?.title || 'Kein Inhalt verfügbar'}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Neue Lektion erstellen Tab
function CreateLessonTab({ courseId, onLessonCreated: _onLessonCreated }: { courseId: string; onLessonCreated?: () => void; }) {
  void _onLessonCreated;
  const pathname = usePathname();
  const inTeacherContext = pathname?.startsWith('/teacher/');
  const templates = [
    { type: "single-choice", name: "📝 Single Choice Quiz", description: "Einfache Multiple-Choice Fragen erstellen" },
    { type: "multiple-choice", name: "❓❓ Multiple Choice", description: "Mehrere richtige Antworten" },
    { type: "markdown", name: "🧾 Text", description: "Informationstext mit Bildern und Links" },
    { type: "matching", name: "🔗 Paare finden", description: "Links/Rechts-Paare verbinden (Bild/Audio möglich)" },
  { type: "video", name: "🎬 Video", description: "YouTube-Link; Abschluss bei vollständigem Ansehen" },
    { type: "memory", name: "🧠 Memory", description: "Paare von Karten (Text/Bild/Audio) finden" },
  { type: "lueckentext", name: "🧩 Lückentext", description: "Markdown mit *Antwort*-Lücken (Input oder Drag)" },
  { type: "ordering", name: "🔢 Reihenfolge", description: "Schritte/Ereignisse in korrekte Reihenfolge bringen" }
  , { type: "text-answer", name: "✍️ Text-Antwort", description: "Freitext-Antwort mit Teilantworten & Case-Sensitivity" }
  , { type: "snake", name: "🐍 Snake", description: "Minigame – erreiche Punkteziel für Abschluss" }
  ];

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Neue Lektion erstellen</h2>
      <p className="mb-6 text-gray-600">Wähle einen Lektions-Typ:</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(template => (
          <a
            key={template.type}
            href={inTeacherContext
              ? (template.type === 'single-choice' ? `/teacher/lektion/single-choice?courseId=${courseId}` : `/teacher/lektion/neu?type=${template.type}&courseId=${courseId}`)
              : (template.type === 'single-choice' ? `/autor/lektion/single-choice?courseId=${courseId}` : `/autor/lektion/neu?type=${template.type}&courseId=${courseId}`)
            }
            className="border rounded p-6 hover:bg-blue-50 hover:border-blue-300 transition-colors block"
          >
            <div className="text-3xl mb-3">{getLessonTypeIcon(template.type)}</div>
            <h3 className="font-semibold mb-2">{template.name}</h3>
            <p className="text-gray-600 text-sm">{template.description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}

// Vorhandene Lektionen einfügen Tab
function ExistingLessonsTab({ courseId, onLessonAdded }: { courseId: string; onLessonAdded?: () => void; }) {
  const [availableLessons, setAvailableLessons] = useState<LessonListItem[]>([]);
  const [previewLesson, setPreviewLesson] = useState<LessonListItem | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addedLessons, setAddedLessons] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const loadGlobalLessons = async () => {
      try {
        const res = await fetch('/api/lessons');
        if (res.ok) {
          const data = await res.json();
          const all: LessonListItem[] = data.lessons || [];
          // Unterstützt neue geteilte Struktur (courseIds) => ausschließen falls bereits enthalten
          const filtered = all.filter((l: LessonListItem) => {
            if (l.courseIds && Array.isArray(l.courseIds)) {
              return !l.courseIds.includes(courseId);
            }
            return l.courseId !== courseId; // legacy
          });
          setAvailableLessons(filtered);
        }
      } catch (e) {
        console.error('Globale Lektionen laden fehlgeschlagen', e);
      }
    };
    loadGlobalLessons();
  }, [courseId]);

  const handleAddLesson = async (lesson: LessonListItem) => {
    if (!lesson._id) return;
    // Confirm via toast-like UX
    const ok = window.confirm(`Lektion "${lesson.title}" in diesen Kurs kopieren?`);
    if (!ok) return;
    setIsAdding(true);
    try {
      const res = await fetch(`/api/kurs/${courseId}/lektionen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceLessonId: lesson._id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAddedLessons(a => [...a, lesson._id as string]);
        if (onLessonAdded) onLessonAdded();
        toast({ title: 'Lektion kopiert', message: `"${lesson.title}" wurde hinzugefügt.`, kind: 'success' });
      } else {
        const msg = `Fehler: ${data?.error || res.statusText || 'Unbekannt'}`;
        console.error('Copy lesson failed', data);
        toast({ title: 'Kopieren fehlgeschlagen', message: msg, kind: 'error' });
      }
    } catch {
      toast({ title: 'Netzwerkfehler', message: 'Beim Kopieren ist ein Netzwerkfehler aufgetreten.', kind: 'error' });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Vorhandene Lektion kopieren</h2>
      {showPreview && previewLesson && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg p-8 max-w-xl w-full relative">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-800"
              onClick={() => setShowPreview(false)}
            >
              ✖
            </button>
            <h2 className="text-xl font-bold mb-4">Vorschau: {previewLesson.title}</h2>
            {/* Zeige Fragen, Inhalt, Typ usw. */}
            {previewLesson.type === 'matching' && Array.isArray(previewLesson.questions) && previewLesson.questions.length > 0 ? (
              <div>
                <div className="text-sm text-gray-600 mb-3">🔗 Paare verbinden (max. 5 pro Aufgabe)</div>
                <div className="space-y-3">
                  {previewLesson.questions!.map((q, qi) => {
                    const pairs = (q.correctAnswers || []).map((k) => {
                      const [l, r] = String(k).split('=>');
                      return { l: (l || '').trim(), r: (r || '').trim() };
                    }).filter(p => p.l && p.r);
                    return (
                      <div key={qi} className="grid grid-cols-2 gap-6 border rounded p-3">
                        <div>
                          <h4 className="font-medium mb-2">Aufgabe {qi + 1} – Links</h4>
                          <ul className="space-y-2">
                            {pairs.map((p, idx) => (
                              <li key={`l-${qi}-${idx}`} className="p-2 border rounded bg-gray-50">{p.l}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-medium mb-2">Aufgabe {qi + 1} – Rechts</h4>
                          <ul className="space-y-2">
                            {pairs.map((p, idx) => (
                              <li key={`r-${qi}-${idx}`} className="p-2 border rounded bg-gray-50">{p.r}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : ((previewLesson.type === 'single-choice' || previewLesson.type === 'multiple-choice') && Array.isArray(previewLesson.questions) && previewLesson.questions.length > 0) ? (
              <div>
                {previewLesson.questions.map((q: LessonQuestion, idx: number) => (
                  <div key={idx} className="mb-4">
                    <div className="font-semibold">Frage {idx + 1}: {q.question}</div>

                    {/* Medien-Vorschau */}
                    {q.mediaLink && (
                      <div className="mt-2 mb-2">
                        {q.mediaLink.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={q.mediaLink}
                            alt="Fragen-Medien"
                            className="max-h-60 rounded border"
                            onError={(e) => {
                              const parent = (e.target as HTMLImageElement).parentElement;
                              if (parent) {
                                parent.innerHTML = `<p class=\"text-red-600 text-sm\">❌ Bild konnte nicht geladen werden: ${q.mediaLink}</p>`;
                              }
                            }}
                          />
                        ) : q.mediaLink.match(/\.(mp3|wav|ogg|m4a)$/i) ? (
                          <audio controls className="w-full">
                            <source src={q.mediaLink} />
                            Dein Browser unterstützt das Audio-Element nicht.
                            <a
                              href={q.mediaLink}
                              target="_blank"
                              rel="noreferrer"
                              className="underline text-blue-600 ml-1"
                            >
                              Audio öffnen
                            </a>
                          </audio>
                        ) : (
                          <a
                            href={q.mediaLink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 underline break-all"
                          >
                            📎 {q.mediaLink}
                          </a>
                        )}
                      </div>
                    )}

                    <div className="mt-2">
                      {q.allAnswers?.map((a: string, i: number) => (
                        <div
                          key={i}
                          className={`p-2 rounded border mb-1 ${(q.correctAnswer === a || (q.correctAnswers?.includes?.(a))) ? 'bg-green-50 border-green-400' : 'bg-gray-50 border-gray-300'}`}
                        >
                          {a} {(q.correctAnswer === a || (q.correctAnswers?.includes?.(a))) && <span className="text-green-600 ml-2">✓</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : previewLesson.type === 'video' ? (
              <div className="space-y-4">
                {(() => { const cAny:any = previewLesson.content as any; const raw = String(cAny?.youtubeUrl || cAny?.url || cAny?.link || ''); const id = extractYouTubeIdPreview(raw); return id ? (
                  <div className="aspect-video w-full bg-black rounded overflow-hidden">
                    <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${id}`} title="YouTube Vorschau" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" />
                  </div>
                ) : <div className="text-sm text-gray-500">Kein (gültiger) YouTube-Link gespeichert.</div>; })()}
                {previewLesson.content && (previewLesson.content as any).text ? (
                  <div className="prose max-w-none text-sm bg-gray-50 border rounded p-3 overflow-auto max-h-64">
                    {(previewLesson.content as any).text}
                  </div>
                ) : <div className="text-xs text-gray-400">Kein Begleittext.</div>}
              </div>
            ) : previewLesson.type === 'memory' ? (
              <div>
                <div className="text-sm text-gray-600 mb-3">🧠 Memory Paare</div>
                {(() => { const c:any = previewLesson.content || {}; const pairs = Array.isArray(c.pairs)? c.pairs : []; if(!pairs.length) return <div className="text-gray-400 text-sm">Keine Paare gespeichert.</div>; return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {pairs.map((p:any,idx:number)=>(
                      <div key={idx} className="border rounded p-2 bg-gray-50 text-xs flex flex-col gap-1">
                        <MemoryPreviewSide side={p.a} />
                        <div className="text-center text-gray-400 text-[10px]">↕</div>
                        <MemoryPreviewSide side={p.b} />
                      </div>
                    ))}
                  </div>
                ); })()}
              </div>
            ) : previewLesson.type === 'lueckentext' ? (
              <div>
                <div className="text-sm text-gray-600 mb-3">🧩 Lückentext</div>
                {(() => { const c:any = previewLesson.content || {}; const masked = String(c.markdownMasked || ''); const gaps = Array.isArray(c.gaps)? c.gaps: []; if(!masked) return <div className="text-gray-400 text-sm">Kein Text.</div>; return (
                  <div className="space-y-4">
                    <div className="prose max-w-none border rounded p-3 bg-gray-50 text-sm whitespace-pre-wrap">{masked}</div>
                    {gaps.length>0 && <div className="flex flex-wrap gap-2 text-xs">{gaps.map((g:any)=><span key={g.id} className="px-2 py-1 border rounded bg-white">{g.id}:{g.answer}</span>)}</div>}
                    <div className="text-xs text-gray-500">Modus: <strong>{c.mode==='drag'?'Drag & Drop':'Eingabe'}</strong></div>
                  </div>
                ); })()}
              </div>
            ) : (
              <div className="text-gray-600">{previewLesson.content ? previewLesson.content.title : 'Kein Inhalt'}</div>
            )}
          </div>
        </div>
      )}

      {availableLessons.length === 0 && (
        <div className="text-gray-500 text-sm">Keine anderen Lektionen verfügbar.</div>
      )}
      <div className="space-y-3">
        {availableLessons.map(l => (
          <div key={l._id || l.id} className="border rounded p-4 bg-white flex justify-between items-start">
            <div>
              <h3 className="font-semibold flex items-center gap-2">{getLessonTypeIcon(l.type)} {l.title}</h3>
              {l.questions && <p className="text-xs text-gray-500">{l.questions.length} Fragen</p>}
              {l.courseIds && Array.isArray(l.courseIds) && (
                <p className="text-xs text-gray-400">Verwendet in {(l.courseIds?.length) || 1} Kurs(en)</p>
              )}
              <button onClick={() => { setPreviewLesson(l); setShowPreview(true); }} className="mt-2 text-blue-600 text-xs hover:underline">👁️ Vorschau</button>
            </div>
            <div className="flex gap-2">
              <button disabled={isAdding || (l._id ? addedLessons.includes(l._id) : false)} onClick={() => handleAddLesson(l)} className="bg-green-600 disabled:opacity-50 text-white px-3 py-1 rounded text-sm hover:bg-green-700">➕ Kopieren</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Hilfs-Komponenten
function MemoryPreviewSide({ side }: { side: { kind: string; value: string } }) {
  if (side.kind === 'image') return <div className="h-14 flex items-center justify-center overflow-hidden bg-white border rounded"><img src={side.value} alt="" className="max-h-14 max-w-full object-contain" /></div>;
  if (side.kind === 'audio') return <div className="h-14 flex items-center justify-center bg-white border rounded px-1"><audio controls className="w-full"><source src={side.value} /></audio></div>;
  return <div className="h-14 flex items-center justify-center text-center px-1 break-words bg-white border rounded text-xs">{side.value}</div>;
}

function getLessonTypeIcon(type: string) {
  switch (type) {
    case 'single-choice': return '📝';
    case 'multiple-choice': return '❓';
    case 'text': return '📖';
    case 'video': return '🎥';
    case 'markdown': return '🧾';
    case 'matching': return '🔗';
    case 'memory': return '🧠';
    case 'lueckentext': return '🧩';
    case 'ordering': return '🔢';
    case 'text-answer': return '✍️';
  case 'video': return '🎬';
    default: return '📦';
  }
}
function getLessonTypeName(type: string) {
  switch (type) {
    case 'single-choice': return 'Single Choice';
    case 'multiple-choice': return 'Multiple Choice';
    case 'text': return 'Text';
    case 'video': return 'Video';
    case 'markdown': return 'Markdown-Text';
    case 'matching': return 'Paare finden';
    case 'memory': return 'Memory';
    case 'lueckentext': return 'Lückentext';
    case 'ordering': return 'Reihenfolge';
    case 'text-answer': return 'Text-Antwort';
  case 'video': return 'Video';
    default: return type;
  }
}

function MarkdownInline({ markdown }: { markdown: string }) {
  const [MD, setMD] = useState<ComponentType<Record<string, unknown>> | null>(null);
  const [gfm, setGfm] = useState<unknown>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const m = await import('react-markdown');
      const g = await import('remark-gfm');
      if (mounted) {
        setMD(() => (m.default as unknown as ComponentType<Record<string, unknown>>));
        const gMod = g as { default?: unknown };
        setGfm(() => gMod.default ?? g );
      }
    })();
    return () => { mounted = false; };
  }, []);
  if (!MD) return <span className="text-gray-400">Lade…</span>;
  const Comp = MD;
  return <Comp remarkPlugins={gfm ? [gfm] : []}>{markdown}</Comp>;
}

function extractYouTubeIdPreview(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.replace('/', '') || null;
    const v = u.searchParams.get('v'); if (v) return v;
    const m1 = u.pathname.match(/\/embed\/([\w-]{6,})/); if (m1) return m1[1];
    const m2 = u.pathname.match(/\/shorts\/([\w-]{6,})/); if (m2) return m2[1];
    const last = u.pathname.split('/').filter(Boolean).pop(); if (last && /^[\w-]{6,}$/.test(last)) return last;
    return null;
  } catch {
    if (/^[\w-]{6,}$/.test(url)) return url;
    return null;
  }
}

"use client";
import { Suspense, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

interface TeacherClass { _id:string; name:string; }
interface Learner { username:string; name?:string; email?:string; class?:string; }

export default function TeacherPanel(){
  return (
    <Suspense fallback={<div className="p-6">Lade…</div>}>
      <TeacherPanelContent />
    </Suspense>
  );
}

function TeacherPanelContent(){
  const { data: session, status } = useSession();
  const router = useRouter();
  const [classes,setClasses]=useState<TeacherClass[]>([]);
  const [learners,setLearners]=useState<Learner[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [newClass,setNewClass]=useState("");
  const [newLearner,setNewLearner]=useState({ username:"", name:"", password:"", email:"", classId:"" });
  const [busy,setBusy]=useState(false);
  const search = useSearchParams();
  const teacherParam = search?.get('teacher') || '';
  const [filterClass,setFilterClass]=useState('');
  const [bulkOpen,setBulkOpen]=useState(false);
  const [bulkText,setBulkText]=useState('');
  const [bulkResult,setBulkResult]=useState<{createdCount:number; skippedCount:number; created:any[]; skipped:any[]}|null>(null);
  const isAdminContext = !!teacherParam;
  const [ctxInfo,setCtxInfo]=useState<{teacherId?:string; teacherParam?:string|null; resolvedTeacherUsername?:string|null}|null>(null);

  useEffect(()=>{
    if(status==='loading') return;
    const role = (session?.user as any)?.role;
    if(status==='unauthenticated') router.push('/login');
    else if(role!=='teacher' && role!=='admin') router.push('/dashboard');
  },[status,(session?.user as any)?.role,router]);

  async function load(){
    setLoading(true); setError(null);
      try{
        const q = teacherParam ? `?teacher=${encodeURIComponent(teacherParam)}` : '';
        const res = await fetch('/api/teacher/manage'+q);
        let data: any = null;
        try { data = await res.json(); } catch { /* ignore */ }
  if(res.ok && data?.success){ setClasses(data.classes); setLearners(data.learners); setCtxInfo(data._context||null); }
        else setError((data && (data.error||data.message)) || `Fehler (${res.status})`);
      }catch{ setError('Netzwerkfehler'); }
    setLoading(false);
  }
  useEffect(()=>{ if((session?.user as any)?.role==='teacher' || (session?.user as any)?.role==='admin') load(); },[(session?.user as any)?.role, teacherParam]);
  // Beim Wechsel des Teacher-Kontexts Filter zurücksetzen
  useEffect(()=>{ setFilterClass(''); }, [teacherParam]);
  // Wenn der aktuelle Filter nicht mehr existiert (z. B. anderer Teacher), Filter leeren
  useEffect(()=>{
    if(filterClass && !classes.some(c=>c._id===filterClass)) setFilterClass('');
  }, [classes, filterClass]);

  async function createClass(e:React.FormEvent){
    e.preventDefault(); if(!newClass) return; setBusy(true);
    try{
      const body:any = { action:'createClass', name:newClass };
      if(teacherParam) body.teacherUsername = teacherParam;
      const res=await fetch('/api/teacher/manage',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
      const d=await res.json();
      if(res.ok&&d.success){ setClasses(c=>[...c,{ _id:d.class.id, name:d.class.name }]); setNewClass(''); }
    } finally { setBusy(false); }
  }
  async function createLearner(e:React.FormEvent){
    e.preventDefault(); if(!newLearner.username||!newLearner.name||!newLearner.password) return; setBusy(true);
    try{
      const body:any = { action:'createLearner', ...newLearner };
      if(teacherParam) body.teacherUsername = teacherParam;
      const res=await fetch('/api/teacher/manage',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
      const d=await res.json();
      if(res.ok&&d.success){ setLearners(l=>[...l,{ username:d.learner.username, name:d.learner.name, class:newLearner.classId||undefined }]); setNewLearner({ username:'', name:'', password:'', email:'', classId:'' }); }
      else setError(d.error||`Fehler (${res.status})`);
    } catch { setError('Netzwerkfehler'); } finally { setBusy(false); }
  }
  async function moveLearner(username:string,classId:string){
    setBusy(true);
    try{
      const body:any = { action:'moveLearner', learnerUsername:username, toClassId: classId||null };
      if(teacherParam) body.teacherUsername = teacherParam;
      const res=await fetch('/api/teacher/manage',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
      if(res.ok){ setLearners(ls=>ls.map(l=>l.username===username?{...l,class:classId||undefined}:l)); }
    } finally { setBusy(false); }
  }
  async function deleteLearner(username:string){
    if(!confirm(`Lernenden ${username} löschen?`)) return; setBusy(true);
    try{
      const body:any = { action:'deleteLearner', learnerUsername:username };
      if(teacherParam) body.teacherUsername = teacherParam;
      const res=await fetch('/api/teacher/manage',{ method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
      if(res.ok){ setLearners(ls=>ls.filter(l=>l.username!==username)); }
    } finally { setBusy(false); }
  }

  if(status==='loading' || loading) return <div className="p-6">Lade…</div>;

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-10">
      <div className="flex items-center justify-between">
        <button type="button" onClick={()=>router.back()} className="text-sm text-blue-600 hover:underline">← Zurück</button>
        <h1 className="text-2xl font-bold">Teacher Panel</h1>
        <div />
      </div>
      {error && <div className="text-red-600 text-sm">{error}</div>}

      {isAdminContext && (
        <section className="bg-yellow-50 border border-yellow-200 rounded p-4 space-y-3 text-xs">
          <div className="font-semibold text-yellow-800">Admin-Modus</div>
          <p className="text-yellow-800">Du betrachtest das Panel von: <code className="px-1 py-0.5 bg-white border rounded">{teacherParam}</code>. Aktionen werden dem gewählten Teacher zugeordnet.</p>
          {ctxInfo && (
            <div className="text-yellow-800">Kontext: teacherId=<code className="px-1 bg-white border rounded">{ctxInfo.teacherId||'?'}</code>{ctxInfo.resolvedTeacherUsername? <> • username=<code className="px-1 bg-white border rounded">{ctxInfo.resolvedTeacherUsername}</code></> : null}</div>
          )}
          <details>
            <summary className="cursor-pointer text-yellow-800">Werkzeug: Lernende übernehmen (Migration)</summary>
            <div className="mt-2 space-y-2">
              <p>Liste von Benutzernamen (jeweils durch Komma oder Zeilenumbruch getrennt), die auf diesen Teacher übertragen werden sollen. Nicht existente werden übersprungen. Klassen, die dem Teacher nicht gehören, werden geleert.</p>
              <AdminReassignTool teacherParam={teacherParam} onDone={load} />
            </div>
          </details>
        </section>
      )}

      <section className="bg-white border rounded p-4 space-y-4">
        <h2 className="font-semibold">Klassen</h2>
        <form onSubmit={createClass} className="flex gap-2 text-xs">
          <input value={newClass} onChange={e=>setNewClass(e.target.value)} placeholder="Neue Klasse" className="border rounded px-2 py-1" />
          <button disabled={busy} className="bg-blue-600 text-white px-3 py-1 rounded text-xs disabled:opacity-50">Anlegen</button>
        </form>
        <ul className="text-xs list-disc pl-4">
          {classes.map(c=> <li key={c._id}>{c.name} (ID {c._id})</li>)}
          {classes.length===0 && <li className="list-none text-gray-500">Keine Klassen</li>}
        </ul>
      </section>

      <section className="bg-white border rounded p-4 space-y-4">
        <h2 className="font-semibold">Lernende</h2>
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <label className="flex items-center gap-1">Filter Klasse:
            <select value={filterClass} onChange={e=>setFilterClass(e.target.value)} className="border rounded px-2 py-1">
              <option value="">(alle)</option>
              {classes.map(c=> <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </label>
          {filterClass && (
            <button type="button" onClick={()=>setFilterClass('')} className="px-2 py-1 border rounded">Filter zurücksetzen</button>
          )}
          <button type="button" onClick={()=>setBulkOpen(true)} className="px-3 py-1 border rounded bg-white hover:bg-gray-50">Mehrere Lernende…</button>
        </div>
        <form onSubmit={createLearner} className="grid gap-2 md:grid-cols-6 text-xs items-start">
          <input value={newLearner.username} onChange={e=>setNewLearner(f=>({...f,username:e.target.value}))} placeholder="Username" className="border rounded px-2 py-1" required />
          <input value={newLearner.name} onChange={e=>setNewLearner(f=>({...f,name:e.target.value}))} placeholder="Name" className="border rounded px-2 py-1" required />
          <input value={newLearner.email} onChange={e=>setNewLearner(f=>({...f,email:e.target.value}))} placeholder="E-Mail" className="border rounded px-2 py-1" />
          <input type="password" value={newLearner.password} onChange={e=>setNewLearner(f=>({...f,password:e.target.value}))} placeholder="Passwort" className="border rounded px-2 py-1" required />
          <select value={newLearner.classId} onChange={e=>setNewLearner(f=>({...f,classId:e.target.value}))} className="border rounded px-2 py-1">
            <option value="">(keine Klasse)</option>
            {classes.map(c=> <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <button disabled={busy} className="bg-green-600 text-white px-3 py-1 rounded disabled:opacity-50">Anlegen</button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="py-1 px-2">User</th>
                <th className="py-1 px-2">Name</th>
                <th className="py-1 px-2">E-Mail</th>
                <th className="py-1 px-2">Klasse</th>
                <th className="py-1 px-2">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {learners.filter(l=>!filterClass || l.class===filterClass).map(l=> (
                <tr key={l.username} className="border-t">
                  <td className="py-1 px-2 font-medium">{l.username}</td>
                  <td className="py-1 px-2">{l.name||'—'}</td>
                  <td className="py-1 px-2">{l.email||'—'}</td>
                  <td className="py-1 px-2">
                    <select value={l.class||''} onChange={e=>moveLearner(l.username,e.target.value)} className="border rounded px-1 py-0.5 text-[11px]">
                      <option value="">(keine)</option>
                      {classes.map(c=> <option key={c._id} value={c._id}>{c.name}</option>)}
                    </select>
                  </td>
                  <td className="py-1 px-2">
                    <button onClick={()=>deleteLearner(l.username)} className="text-red-600 hover:underline">Löschen</button>
                  </td>
                </tr>
              ))}
              {learners.length===0 && <tr><td colSpan={5} className="py-2 text-gray-500">Keine Lernenden</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {bulkOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center pt-20 z-50">
          <div className="bg-white w-full max-w-3xl rounded shadow-lg p-4 space-y-4 text-xs">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">Mehrere Lernende anlegen</h3>
              <button onClick={()=>{setBulkOpen(false); setBulkResult(null);}} className="text-gray-500 hover:text-black">✕</button>
            </div>
            <p className="text-gray-600 leading-relaxed">Format: benutzer, name, passwort, klasse, email (email optional, klasse optional). Trennzeichen: Komma / Semikolon / Tab. Eine Zeile pro Lernendem. Nicht vorhandene Klassen werden automatisch erstellt.</p>
            <textarea value={bulkText} onChange={e=>setBulkText(e.target.value)} rows={10} className="w-full border rounded p-2 font-mono" placeholder="max, Max Mustermann, secret123, 5a, max@example.org"></textarea>
            <div className="flex gap-2">
              <button disabled={busy} onClick={async()=>{ setBusy(true); setBulkResult(null); try{ const body:any = { action:'bulkCreateLearners', lines: bulkText }; if(teacherParam) body.teacherUsername = teacherParam; const res = await fetch('/api/teacher/manage',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)}); const d=await res.json(); if(res.ok && d.success){ setBulkResult(d); // reload lists
                setLearners(prev=>[...prev, ...d.created.map((c:any)=>({ username:c.username, name:c.name, class: classes.find(cl=>cl.name===c.class)?._id }))]);
                // neue Klassen nachladen (falls erzeugt)
                load();
              } else setBulkResult({ createdCount:0, skippedCount:0, created:[], skipped:[{ line:'', reason:d.error||'Fehler' }]}); } finally { setBusy(false); } }} className="bg-green-600 text-white px-3 py-1 rounded disabled:opacity-50">Import starten</button>
              <button type="button" onClick={()=>{ setBulkText(''); setBulkResult(null); }} className="px-3 py-1 border rounded">Reset</button>
            </div>
            {bulkResult && (
              <div className="border rounded p-2 bg-gray-50 space-y-1">
                <div><strong>Erstellt:</strong> {bulkResult.createdCount} • <strong>Übersprungen:</strong> {bulkResult.skippedCount}</div>
                {bulkResult.skipped.length>0 && <details className="mt-1"><summary className="cursor-pointer">Details übersprungen</summary><ul className="list-disc pl-4 mt-1 space-y-0.5">{bulkResult.skipped.map((s:any,i:number)=><li key={i}>{s.reason} – <code>{s.line}</code></li>)}</ul></details>}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function AdminReassignTool({ teacherParam, onDone }:{ teacherParam:string; onDone:()=>void }){
  const [text,setText]=useState('');
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState<string>('');
  return (
    <div className="border rounded p-2 bg-white">
      <textarea value={text} onChange={e=>setText(e.target.value)} rows={4} className="w-full border rounded p-2 font-mono" placeholder="max\nlea\nali"></textarea>
      <div className="mt-2 flex gap-2 items-center">
        <button disabled={busy||!text.trim()} onClick={async()=>{
          setBusy(true); setMsg('');
          const usernames = text.split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean);
          try{
            const body:any = { action:'reassignLearnerOwner', learnerUsernames: usernames };
            if(teacherParam) body.teacherUsername = teacherParam;
            const res = await fetch('/api/teacher/manage',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
            const d = await res.json();
            if(res.ok && d.success){ setMsg(`Übernommen: ${d.updated}, Klassen geleert: ${d.clearedClass}, nicht gefunden: ${d.notFound?.length||0}`); onDone(); }
            else setMsg(d.error||`Fehler (${res.status})`);
          } catch { setMsg('Netzwerkfehler'); }
          setBusy(false);
        }} className="px-3 py-1 bg-yellow-600 text-white rounded disabled:opacity-50">Übernehmen</button>
        {msg && <span className="text-xs text-gray-700">{msg}</span>}
      </div>
    </div>
  );
}

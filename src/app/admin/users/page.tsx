"use client";
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface UserRow { username:string; name?:string; role:string; email?:string; createdAt?:string; }

export default function AdminUsersPage(){
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ username:'', name:'', password:'', email:'', role:'author' });
  const [updating, setUpdating] = useState<string|null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(()=>{
    if(status==='loading') return;
    const role = (session?.user as any)?.role;
    if(status==='unauthenticated' || role !== 'admin'){
      router.push('/dashboard');
    }
  },[status, (session?.user as any)?.role, router]);

  async function load(){
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if(res.ok && data.success){ setUsers(data.users); }
      else setError(data.error||'Fehler');
    } catch { setError('Netzwerkfehler'); }
    setLoading(false);
  }
  useEffect(()=>{ if((session?.user as any)?.role==='admin') load(); }, [(session?.user as any)?.role]);

  async function createUser(e:React.FormEvent){
    e.preventDefault(); if(!createForm.username||!createForm.name||!createForm.password) return;
    setCreating(true); setError(null);
    try{
      const res = await fetch('/api/admin/users',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username:createForm.username, name:createForm.name, password:createForm.password, email:createForm.email, makeRole:createForm.role })});
      const data = await res.json();
      if(res.ok && data.success){ setCreateForm({ username:'', name:'', password:'', email:'', role:'author' }); load(); }
      else setError(data.error||'Fehler');
    } catch { setError('Netzwerkfehler'); }
    setCreating(false);
  }

  async function changeRole(username:string, newRole:string){
    setUpdating(username);
    try {
      const res = await fetch('/api/admin/users',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, newRole })});
      const data = await res.json();
      if(res.ok && data.success){ setUsers(prev=>prev.map(u=>u.username===username?{...u, role:newRole}:u)); }
      else alert(data.error||'Fehler');
    } catch { alert('Netzwerkfehler'); }
    setUpdating(null);
  }

  async function deleteUser(username:string){
    if(!confirm(`Benutzer "${username}" wirklich löschen?`)) return;
    try {
      const res = await fetch('/api/admin/users',{ method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username })});
      const data = await res.json();
      if(res.ok && data.success){
        setUsers(prev=>prev.filter(u=>u.username!==username));
        // Falls aktuelle Seite dadurch leer wird und nicht erste Seite, Seite zurück
        setTimeout(()=>{
          setPage(p=>{
            const maxPage = Math.max(1, Math.ceil((prevLengthAfterDelete()) / PAGE_SIZE));
            return Math.min(p, maxPage);
          });
        },0);
      } else alert(data.error||'Fehler');
    } catch { alert('Netzwerkfehler'); }

    function prevLengthAfterDelete(){
      return users.length - 1; // da bereits aus state herausgefiltert
    }
  }

  const pending = users.filter(u=>u.role==='pending-author');
  const pendingTeacher = users.filter(u=>u.role==='pending-teacher');
  const teachers = users.filter(u=>u.role==='teacher');
  const authors = users.filter(u=>u.role==='author');

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-10">
      <h1 className="text-2xl font-bold">Benutzerverwaltung</h1>
      {error && <div className="text-red-600 text-sm">{error}</div>}
  <section className="bg-white border rounded p-4">
        <h2 className="font-semibold mb-3">Ausstehende Autor-Anfragen ({pending.length})</h2>
        {pending.length===0 && <div className="text-xs text-gray-500">Keine.</div>}
        <div className="divide-y">
          {pending.map(p=> (
            <div key={p.username} className="py-2 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
              <div className="text-sm"><span className="font-medium">{p.username}</span>{p.email && <span className="text-gray-500"> • {p.email}</span>}</div>
              <div className="flex gap-2">
                <button disabled={updating===p.username} onClick={()=>changeRole(p.username,'author')} className="px-3 py-1 text-xs rounded bg-green-600 text-white disabled:opacity-50">Freischalten → Autor</button>
                <button disabled={updating===p.username} onClick={()=>changeRole(p.username,'learner')} className="px-3 py-1 text-xs rounded bg-gray-600 text-white disabled:opacity-50">Ablehnen</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border rounded p-4">
        <h2 className="font-semibold mb-3">Ausstehende Lehrpersonen-Anfragen ({pendingTeacher.length})</h2>
        {pendingTeacher.length===0 && <div className="text-xs text-gray-500">Keine.</div>}
        <div className="divide-y">
          {pendingTeacher.map(p=> (
            <div key={p.username} className="py-2 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
              <div className="text-sm"><span className="font-medium">{p.username}</span>{p.email && <span className="text-gray-500"> • {p.email}</span>}</div>
              <div className="flex gap-2">
                <button disabled={updating===p.username} onClick={()=>changeRole(p.username,'teacher')} className="px-3 py-1 text-xs rounded bg-green-600 text-white disabled:opacity-50">Freischalten → Lehrperson</button>
                <button disabled={updating===p.username} onClick={()=>changeRole(p.username,'learner')} className="px-3 py-1 text-xs rounded bg-gray-600 text-white disabled:opacity-50">Ablehnen</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border rounded p-4">
        <h2 className="font-semibold mb-3">Lehrpersonen ({teachers.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left bg-gray-50"><th className="py-1 px-2">Username</th><th className="py-1 px-2">Name</th><th className="py-1 px-2">E-Mail</th><th className="py-1 px-2">Aktion</th></tr></thead>
            <tbody>
              {teachers.map(t=> (
                <tr key={t.username} className="border-t">
                  <td className="py-1 px-2">{t.username}</td>
                  <td className="py-1 px-2">{t.name}</td>
                  <td className="py-1 px-2">{t.email||'—'}</td>
                  <td className="py-1 px-2">
                    <button disabled={updating===t.username} onClick={()=>changeRole(t.username,'learner')} className="text-xs px-2 py-0.5 border rounded hover:bg-gray-50">Zu Lernendem</button>
                  </td>
                </tr>
              ))}
              {teachers.length===0 && <tr><td colSpan={4} className="py-2 text-gray-500">Keine Lehrpersonen.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border rounded p-4">
        <h2 className="font-semibold mb-3">Autoren ({authors.length})</h2>
        <div className="grid gap-2">
          {authors.map(a=> (
            <div key={a.username} className="text-xs flex items-center justify-between border rounded px-2 py-1">
              <span>{a.username}{a.email && <span className="text-gray-500"> • {a.email}</span>}</span>
              <div className="flex gap-2">
                <button disabled={updating===a.username} onClick={()=>changeRole(a.username,'pending-author')} className="px-2 py-0.5 border rounded text-[10px] hover:bg-gray-50">Zurückstellen</button>
                <button disabled={updating===a.username} onClick={()=>changeRole(a.username,'learner')} className="px-2 py-0.5 border rounded text-[10px] hover:bg-gray-50">Entziehen</button>
              </div>
            </div>
          ))}
          {authors.length===0 && <div className="text-xs text-gray-500">Keine Autoren.</div>}
        </div>
      </section>

      <section className="bg-white border rounded p-4">
        <h2 className="font-semibold mb-3">Neuen speziellen Benutzer anlegen</h2>
        <form onSubmit={createUser} className="grid gap-3 md:grid-cols-5 text-xs">
          <input value={createForm.username} onChange={e=>setCreateForm(f=>({...f,username:e.target.value}))} placeholder="Username" className="border rounded px-2 py-1" required />
          <input value={createForm.name} onChange={e=>setCreateForm(f=>({...f,name:e.target.value}))} placeholder="Name" className="border rounded px-2 py-1" required />
          <input value={createForm.email} onChange={e=>setCreateForm(f=>({...f,email:e.target.value}))} placeholder="E-Mail" className="border rounded px-2 py-1" />
          <input type="password" value={createForm.password} onChange={e=>setCreateForm(f=>({...f,password:e.target.value}))} placeholder="Passwort" className="border rounded px-2 py-1" required />
          <select value={createForm.role} onChange={e=>setCreateForm(f=>({...f,role:e.target.value}))} className="border rounded px-2 py-1" required>
            <option value="author">Autor</option>
            <option value="teacher">Lehrperson</option>
            <option value="admin">Admin</option>
          </select>
          <div className="md:col-span-5 flex gap-2">
            <button disabled={creating} className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50">{creating? '…':'Erstellen'}</button>
            <button type="button" onClick={()=>setCreateForm({ username:'', name:'', password:'', email:'', role:'author' })} className="px-3 py-1 border rounded">Reset</button>
          </div>
        </form>
      </section>

      <section className="bg-white border rounded p-4">
        <h2 className="font-semibold mb-3">Alle Benutzer</h2>
        {loading ? <div className="text-xs text-gray-500">Lade…</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="py-1 px-2">User</th>
                  <th className="py-1 px-2">Name</th>
                  <th className="py-1 px-2">Rolle</th>
                  <th className="py-1 px-2">E-Mail</th>
                  <th className="py-1 px-2">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {users.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE).map(u=> (
                  <tr key={u.username} className="border-t">
                    <td className="py-1 px-2 font-medium">{u.username}</td>
                    <td className="py-1 px-2">{u.name||'—'}</td>
                    <td className="py-1 px-2">{u.role}</td>
                    <td className="py-1 px-2">{u.email||'—'}</td>
                    <td className="py-1 px-2">
                      <div className="flex items-center gap-2">
                        <select disabled={updating===u.username} value={u.role} onChange={e=>changeRole(u.username,e.target.value)} className="border rounded px-1 py-0.5 text-[11px]">
                          <option value="learner">learner</option>
                          <option value="pending-author">pending-author</option>
                          <option value="pending-teacher">pending-teacher</option>
                          <option value="author">author</option>
                          <option value="teacher">teacher</option>
                          <option value="admin">admin</option>
                        </select>
                        <button type="button" onClick={()=>deleteUser(u.username)} className="text-red-600 hover:underline">Löschen</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length===0 && <tr><td colSpan={5} className="py-2 text-gray-500">Keine Benutzer gefunden.</td></tr>}
              </tbody>
            </table>
            <div className="flex justify-between items-center mt-2 text-[11px]">
              <div>Seite {page} / {Math.max(1, Math.ceil(users.length / PAGE_SIZE))}</div>
              <div className="flex gap-2">
                <button disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="px-2 py-1 border rounded disabled:opacity-40">« Zurück</button>
                <button disabled={page>=Math.ceil(users.length / PAGE_SIZE)} onClick={()=>setPage(p=>p+1)} className="px-2 py-1 border rounded disabled:opacity-40">Weiter »</button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

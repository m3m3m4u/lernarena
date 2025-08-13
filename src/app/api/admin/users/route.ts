import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';

// Liste + Erstellen von speziellen Accounts (teacher, author Freigabe)
export async function GET(){
  await dbConnect();
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if(role !== 'admin') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  // Kopernikus wird im JWT zu admin eskaliert; falls DB noch 'author', korrigieren wir das einmalig
  const usersRaw = await User.find({}, 'username name role email createdAt updatedAt').sort({ createdAt:-1 }).lean();
  let corrected = false;
  for(const u of usersRaw){
    if(u.username === 'Kopernikus' && u.role !== 'admin'){
      await User.updateOne({ username:'Kopernikus' }, { $set:{ role:'admin' } });
      u.role = 'admin';
      corrected = true;
    }
  }
  const users = usersRaw;
  return NextResponse.json({ success:true, users });
}

export async function POST(request: Request){
  await dbConnect();
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if(role !== 'admin') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const body = await request.json().catch(()=>({}));
  const { username, name, password, email, makeRole } = body as any;
  if(!username || !name || !password || !makeRole) return NextResponse.json({ success:false, error:'Felder fehlen' }, { status:400 });
  if(!['author','teacher','admin'].includes(makeRole)) return NextResponse.json({ success:false, error:'Ungültige Rolle' }, { status:400 });
  const existing = await User.findOne({ username });
  if(existing) return NextResponse.json({ success:false, error:'Benutzer existiert' }, { status:409 });
  const bcrypt = await import('bcryptjs');
  const hash = await bcrypt.hash(password,10);
  const user = await User.create({ username, name, password:hash, email: email||undefined, role: makeRole });
  return NextResponse.json({ success:true, user:{ id:String(user._id), username:user.username, role:user.role } });
}

// Patch: Rolle ändern (pending-author -> author, etc.)
export async function PATCH(request: Request){
  await dbConnect();
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if(role !== 'admin') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const body = await request.json().catch(()=>({}));
  const { username, newRole } = body as any;
  if(!username || !newRole) return NextResponse.json({ success:false, error:'Felder fehlen' }, { status:400 });
  if(!['author','teacher','admin','learner','pending-author','pending-teacher'].includes(newRole)) return NextResponse.json({ success:false, error:'Ungültige Rolle' }, { status:400 });
  const user = await User.findOneAndUpdate({ username }, { role:newRole }, { new:true });
  if(!user) return NextResponse.json({ success:false, error:'Benutzer nicht gefunden' }, { status:404 });
  return NextResponse.json({ success:true, user:{ username:user.username, role:user.role } });
}

// Benutzer löschen
export async function DELETE(request: Request){
  await dbConnect();
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if(role !== 'admin') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const body = await request.json().catch(()=>({}));
  const { username } = body as any;
  if(!username) return NextResponse.json({ success:false, error:'Username fehlt' }, { status:400 });
  if(username === (session?.user as any)?.username) return NextResponse.json({ success:false, error:'Eigenen Account nicht löschen' }, { status:400 });
  const res = await User.deleteOne({ username });
  if(res.deletedCount === 0) return NextResponse.json({ success:false, error:'Benutzer nicht gefunden' }, { status:404 });
  return NextResponse.json({ success:true, deleted: username });
}

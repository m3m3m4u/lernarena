import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import TeacherClass from '@/models/TeacherClass';
import { hash } from 'bcryptjs';

// Teacher Management Endpoint
// GET: Übersicht (eigene Klassen + eigene Lernende)
// POST action=createClass { name }
// POST action=createLearner { username, name, password, email?, classId? }
// POST action=bulkCreateLearners { lines }
// PATCH action=moveLearner { learnerUsername, toClassId|null }
// DELETE action=deleteLearner { learnerUsername }

export async function GET(){
  await dbConnect();
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const teacherId = (session?.user as any)?.id;
  if(role !== 'teacher' && role !== 'admin') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const classes = await TeacherClass.find({ teacher: teacherId }).lean();
  const learners = await User.find({ ownerTeacher: teacherId }, 'username name email class createdAt role').lean();
  return NextResponse.json({ success:true, classes, learners });
}

export async function POST(req: NextRequest){
  await dbConnect();
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const teacherId = (session?.user as any)?.id;
  if(role !== 'teacher' && role !== 'admin') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const body = await req.json().catch(()=>({}));
  const { action } = body;
  if(action === 'createClass'){
    const { name } = body;
    if(!name) return NextResponse.json({ success:false, error:'Name fehlt' }, { status:400 });
    const cls = await TeacherClass.create({ name, teacher: teacherId });
    return NextResponse.json({ success:true, class:{ id: String(cls._id), name: cls.name } });
  }
  if(action === 'createLearner'){
    const { username, name, password, email, classId } = body;
    if(!username || !name || !password) return NextResponse.json({ success:false, error:'Felder fehlen' }, { status:400 });
    const existing = await User.findOne({ username });
    if(existing) return NextResponse.json({ success:false, error:'Benutzer existiert' }, { status:409 });
    const hashed = await hash(password, 10);
    const learner = await User.create({ username, name, password: hashed, email: email||undefined, role:'learner', ownerTeacher: teacherId, class: classId || undefined });
    return NextResponse.json({ success:true, learner:{ username: learner.username, name: learner.name } });
  }
  if(action === 'bulkCreateLearners'){
    const { lines } = body as any;
    if(!lines || typeof lines !== 'string') return NextResponse.json({ success:false, error:'lines fehlt' }, { status:400 });
    const rawLines = lines.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0);
    const created: any[] = [];
    const skipped: any[] = [];
    for(const line of rawLines){
      // Erlaubte Trenner: Komma, Semikolon oder Tab
      const parts = line.split(/[;,\t]/).map(p=>p.trim()).filter(p=>p.length>0);
      if(parts.length < 3){ skipped.push({ line, reason:'zu wenig Felder' }); continue; }
      const [username, name, password, className, email] = parts;
      if(!username || !name || !password){ skipped.push({ line, reason:'Pflichtfeld leer' }); continue; }
      const exists = await User.findOne({ username });
      if(exists){ skipped.push({ line, reason:'Benutzer existiert' }); continue; }
      let classId: any = undefined;
      if(className){
        let cls = await TeacherClass.findOne({ teacher: teacherId, name: className });
        if(!cls){ cls = await TeacherClass.create({ name: className, teacher: teacherId }); }
        classId = cls._id;
      }
      const hashed = await hash(password,10);
      const learner = await User.create({ username, name, password: hashed, email: email||undefined, role:'learner', ownerTeacher: teacherId, class: classId });
      created.push({ username: learner.username, name: learner.name, class: className||null });
    }
    return NextResponse.json({ success:true, createdCount: created.length, skippedCount: skipped.length, created, skipped });
  }
  return NextResponse.json({ success:false, error:'Unbekannte Aktion' }, { status:400 });
}

export async function PATCH(req: NextRequest){
  await dbConnect();
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const teacherId = (session?.user as any)?.id;
  if(role !== 'teacher' && role !== 'admin') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const body = await req.json().catch(()=>({}));
  const { action } = body;
  if(action === 'moveLearner'){
    const { learnerUsername, toClassId } = body;
    if(!learnerUsername) return NextResponse.json({ success:false, error:'learnerUsername fehlt' }, { status:400 });
    const learner = await User.findOne({ username: learnerUsername });
    if(!learner) return NextResponse.json({ success:false, error:'Nicht gefunden' }, { status:404 });
    if(String(learner.ownerTeacher) !== String(teacherId) && role!=='admin') return NextResponse.json({ success:false, error:'Keine Berechtigung' }, { status:403 });
    learner.class = toClassId || undefined;
    await learner.save();
    return NextResponse.json({ success:true });
  }
  return NextResponse.json({ success:false, error:'Unbekannte Aktion' }, { status:400 });
}

export async function DELETE(req: NextRequest){
  await dbConnect();
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const teacherId = (session?.user as any)?.id;
  if(role !== 'teacher' && role !== 'admin') return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
  const body = await req.json().catch(()=>({}));
  const { action, learnerUsername } = body;
  if(action === 'deleteLearner'){
    if(!learnerUsername) return NextResponse.json({ success:false, error:'learnerUsername fehlt' }, { status:400 });
    const learner = await User.findOne({ username: learnerUsername });
    if(!learner) return NextResponse.json({ success:false, error:'Nicht gefunden' }, { status:404 });
    if(String(learner.ownerTeacher) !== String(teacherId) && role!=='admin') return NextResponse.json({ success:false, error:'Keine Berechtigung' }, { status:403 });
    await learner.deleteOne();
    return NextResponse.json({ success:true });
  }
  return NextResponse.json({ success:false, error:'Unbekannte Aktion' }, { status:400 });
}

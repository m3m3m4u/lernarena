import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Course from '@/models/Course';

// Setzt nachträglich den Autor aller Kurse auf einen gewünschten Namen.
// Nutzung: POST /api/admin/bulk-set-author  mit optionalem JSON { author: "Name" }
export async function POST(request: Request){
  try {
    await dbConnect();
    let desired = 'Kopernikus';
    try {
      const body = await request.json().catch(()=>null) as any;
      if (body && typeof body.author === 'string' && body.author.trim()) desired = body.author.trim();
    } catch { /* ignore body errors */ }
    const res = await Course.updateMany({}, { $set: { author: desired } });
    return NextResponse.json({ success: true, matched: res.matchedCount, modified: res.modifiedCount, author: desired });
  } catch (e) {
    console.error('bulk-set-author Fehler', e);
    return NextResponse.json({ success: false, error: 'Fehler beim Aktualisieren' }, { status: 500 });
  }
}

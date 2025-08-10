import { NextRequest, NextResponse } from "next/server";
// import { getServerSession } from "next-auth/next"; // entfernt für jetzt
// import { authOptions } from "@/lib/authOptions"; // entfernt
import dbConnect from "@/lib/db";
import Course from "@/models/Course";
import Lesson from "@/models/Lesson";
import AuditLog from "@/models/AuditLog";
import User from "@/models/User";

const ALLOWED_CATEGORIES = [
  "Mathematik",
  "Musik",
  "Deutsch",
  "Englisch",
  "Geographie",
  "Geschichte",
  "Physik",
  "Chemie",
  "Biologie",
  "Kunst",
  "sonstiges"
];

export async function GET(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    await dbConnect();
    const { courseId } = params;

    const course = await Course.findById(courseId);
    if (!course) {
      return NextResponse.json(
        { success: false, error: "Kurs nicht gefunden" },
        { status: 404 }
      );
    }

    // Lade auch die Lektionen des Kurses
    const lessons = await Lesson.find({ courseId }).sort({ order: 1 });
    return NextResponse.json({
      success: true,
      course: {
        ...course.toObject(),
        lessonCount: lessons.length
      },
      lessons
    });
  } catch (error) {
    console.error("Fehler beim Laden des Kurses:", error);
    return NextResponse.json(
      { success: false, error: "Fehler beim Laden des Kurses" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    // Auth vorübergehend deaktiviert
    // const session = await getServerSession(authOptions);
    // if (!session) {
    //   return NextResponse.json(
    //     { success: false, error: "Nicht authentifiziert" },
    //     { status: 401 }
    //   );
    // }

    await dbConnect();
    const { courseId } = params;
    const body = await request.json();

    // Falls nur veröffentlicht werden soll, ohne andere Felder
    if (body.publish === true || body.isPublic === true || body.isPublished === true) {
      const published = await Course.findByIdAndUpdate(
        courseId,
        { isPublished: true, updatedAt: new Date() },
        { new: true }
      );
      if (!published) {
        return NextResponse.json({ success: false, error: 'Kurs nicht gefunden' }, { status: 404 });
      }
      return NextResponse.json({ success: true, message: 'Kurs veröffentlicht', course: published });
    }

    // Normales Update (komplette Daten)
    const nameOrTitle = body.name || body.title;
    if (!nameOrTitle || !body.description || !body.category) {
      return NextResponse.json(
        { success: false, error: "Titel/Name, Beschreibung und Kategorie sind erforderlich" },
        { status: 400 }
      );
    }

    if (!ALLOWED_CATEGORIES.includes(body.category)) {
      return NextResponse.json({ success: false, error: 'Ungültige Kategorie' }, { status: 400 });
    }

    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      {
        title: nameOrTitle,
        description: body.description,
        category: body.category,
        isPublished: body.isPublic ?? body.isPublished ?? false,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!updatedCourse) {
      return NextResponse.json(
        { success: false, error: "Kurs nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Kurs erfolgreich aktualisiert",
      course: updatedCourse
    });

  } catch (error) {
    console.error("Fehler beim Aktualisieren des Kurses:", error);
    return NextResponse.json(
      { success: false, error: "Fehler beim Aktualisieren des Kurses" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    await dbConnect();
    const { courseId } = params;
    const body = await request.json();

    if (body.publish === true) {
      const updated = await Course.findByIdAndUpdate(courseId, { isPublished: true, updatedAt: new Date() }, { new: true });
      if (!updated) return NextResponse.json({ success: false, error: 'Kurs nicht gefunden' }, { status: 404 });
      return NextResponse.json({ success: true, course: updated });
    }

    return NextResponse.json({ success: false, error: 'Keine gültige Aktion' }, { status: 400 });
  } catch (error) {
    console.error('Fehler beim Patch:', error);
    return NextResponse.json({ success: false, error: 'Fehler beim Patch' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    // Temporär für Tests ohne Authentifizierung
    // const session = await getServerSession(authOptions);
    // if (!session) {
    //   return NextResponse.json(
    //     { success: false, error: "Nicht authentifiziert" },
    //     { status: 401 }
    //   );
    // }

    await dbConnect();
    const { courseId } = params;
    
  // Lektions-IDs sammeln für Fortschrittsbereinigung
  const lessonIds = await Lesson.find({ courseId }).select('_id').lean();
  const lessonIdStrings = lessonIds.map(l => String(l._id));

  // Lösche zuerst alle Lektionen des Kurses
  await Lesson.deleteMany({ courseId });

  // Kurs löschen
    const deletedCourse = await Course.findByIdAndDelete(courseId);

    if (!deletedCourse) {
      return NextResponse.json(
        { success: false, error: "Kurs nicht gefunden" },
        { status: 404 }
      );
    }

    // Fortschritt bereinigen: sowohl reine lessonId als auch courseId-lessonId Einträge entfernen
    if (lessonIdStrings.length) {
      const keys = [
        ...lessonIdStrings,
        ...lessonIdStrings.map(id => `${courseId}-${id}`)
      ];
      try {
        await User.updateMany(
          { completedLessons: { $in: keys } },
          { $pull: { completedLessons: { $in: keys } } }
        );
      } catch (cleanupErr) {
        console.warn('Fortschritt-Bereinigung (Course Delete) fehlgeschlagen:', cleanupErr);
      }
    }

  try { await AuditLog.create({ action: 'course.delete', targetType: 'course', targetId: String(courseId), meta: { lessonCount: lessonIdStrings.length } }); } catch (e) { console.warn('AuditLog course.delete fehlgeschlagen', e); }
  return NextResponse.json({ success: true, message: "Kurs, Lektionen & Fortschrittseinträge gelöscht" });

  } catch (error) {
    console.error("Fehler beim Löschen des Kurses:", error);
    return NextResponse.json(
      { success: false, error: "Fehler beim Löschen des Kurses" },
      { status: 500 }
    );
  }
}

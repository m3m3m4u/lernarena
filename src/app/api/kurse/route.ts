import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Course from "@/models/Course";
import Lesson from "@/models/Lesson"; // hinzugefügt

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

type LeanCourse = { _id: unknown } & Record<string, unknown>;

type CountAgg = { _id: string; count: number };

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const url = new URL(req.url);
    const showAll = url.searchParams.get("showAll") === "1";
    const filter: Record<string, unknown> = showAll ? {} : { isPublished: true };

    const courses: LeanCourse[] = await Course.find(filter).sort({ createdAt: -1 }).lean();

    const courseIds = courses.map((c) => String(c._id));
    const counts = await Lesson.aggregate<CountAgg>([
      { $match: { courseId: { $in: courseIds } } },
      { $group: { _id: "$courseId", count: { $sum: 1 } } }
    ]);
    const countMap: Record<string, number> = {};
    counts.forEach((c) => { countMap[c._id] = c.count; });

    const coursesWithCounts = courses.map((c) => ({
      ...c,
      lessonCount: countMap[String(c._id)] || 0
    }));

    return NextResponse.json({ success: true, courses: coursesWithCounts });
  } catch (error: unknown) {
    console.error("Fehler beim Laden der Kurse:", error);
    return NextResponse.json(
      { success: false, error: "Fehler beim Laden der Kurse" },
      { status: 500 }
    );
  }
}

interface PostBody {
  title: unknown;
  description: unknown;
  category: unknown;
  tags?: unknown;
  author?: unknown;
  progressionMode?: unknown; // 'linear' | 'free'
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const raw = await req.json();
    const body = raw as PostBody;
  const { title, description, category, tags = [], author: authorFromBody, progressionMode } = body;

    if (!title || !description || !category) {
      return NextResponse.json({ success: false, error: 'Titel, Beschreibung und Kategorie sind erforderlich' }, { status: 400 });
    }

    const catStr = String(category).trim();
    const normalizedCategory = ALLOWED_CATEGORIES.find(c => c.toLowerCase() === catStr.toLowerCase()) || 'sonstiges';

    const author = authorFromBody ? String(authorFromBody) : 'guest';
    const tagsArray: string[] = Array.isArray(tags) ? (tags as unknown[]).map((t) => String(t)) : [];

    const mode = progressionMode === 'linear' ? 'linear' : 'free';
    const newCourse = await Course.create({
      title: String(title).trim(),
      description: String(description).trim(),
      category: normalizedCategory,
      tags: tagsArray,
      author,
      lessons: [],
      isPublished: false,
      progressionMode: mode
    });

    return NextResponse.json({ success: true, courseId: String(newCourse._id), course: newCourse });
  } catch (error: unknown) {
    console.error('Fehler beim Erstellen des Kurses:', error);
    const dev = process.env.NODE_ENV !== 'production';
    const err = error as { name?: string; message?: string; errors?: unknown } | undefined;
    if (err?.name === 'ValidationError') {
      return NextResponse.json({ success: false, error: 'Validierungsfehler', fields: err.errors, message: dev ? err.message : undefined }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Fehler beim Erstellen des Kurses', message: dev ? String(err?.message || error) : undefined }, { status: 500 });
  }
}

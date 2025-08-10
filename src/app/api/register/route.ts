import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import User from "@/models/User";
import { hash } from "bcryptjs";

export async function POST(req: NextRequest) {
  await dbConnect();
  const { username, name, password } = await req.json();

  if (username === 'Kopernikus') {
    return NextResponse.json({ error: 'Dieser Benutzer ist reserviert.' }, { status: 403 });
  }

  if (!username || !name || !password) {
    return NextResponse.json({ error: "Alle Felder sind erforderlich." }, { status: 400 });
  }

  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return NextResponse.json({ error: "Benutzername bereits vergeben." }, { status: 409 });
  }

  const hashedPassword = await hash(password, 10);
  const newUser = new User({
    username,
    name,
    password: hashedPassword,
    completedLessons: [],
    role: 'learner'
  });
  await newUser.save();

  return NextResponse.json({ message: "Registrierung erfolgreich." }, { status: 201 });
}

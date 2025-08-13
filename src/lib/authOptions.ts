import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import { compare } from "bcryptjs";
import { getServerSession } from 'next-auth/next';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Benutzername", type: "text" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials) {
        await dbConnect();
        const user = await User.findOne({ username: credentials?.username });
        if (!user) { console.warn('[auth] user not found', credentials?.username); throw new Error("Benutzer nicht gefunden"); }
        if (!credentials?.password) throw new Error("Passwort fehlt");
        const isValid = await compare(credentials.password, user.password);
        if (!isValid) { console.warn('[auth] invalid password for', credentials?.username); throw new Error("Falsches Passwort"); }
        const id = (user as any)._id ? String((user as any)._id) : (user.id? String(user.id): undefined);
        const rawRole = (user as any).role ? String((user as any).role) : 'learner';
        // pending-author hat noch keine Rechte wie author
        return {
          id,
          name: (user as any).name as string | undefined,
          username: (user as any).username as string | undefined,
          role: rawRole
        } as any; // NextAuth v4 erwartet ein User-ähnliches Objekt
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as { id?: string; username?: string; name?: string; role?: string };
        if (u.id) (token as any).id = u.id;
        if (u.username) (token as any).username = u.username;
        if (u.name) token.name = u.name;
        if (u.role) (token as any).role = u.role;
      }
      // Fallback: spezieller fester Autor
      if ((token as any).username === 'Kopernikus' && (token as any).role !== 'admin') {
        (token as any).role = 'admin';
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        const t = token as { id?: string; sub?: string; username?: string; name?: string; role?: string };
        session.user = {
          ...session.user,
          ...(t.id ? { id: t.id } : (t.sub ? { id: String(t.sub) } : {})),
          ...(t.username ? { username: t.username } : {}),
          ...(t.name ? { name: t.name } : {}),
          ...(t.role ? { role: t.role } : {})
        } as any;
      }
      return session;
    },
  },
};

export async function getSessionServer() { return getServerSession(authOptions); }

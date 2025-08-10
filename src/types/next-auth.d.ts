import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: {
      id?: string;
      username?: string;
      name?: string;
      role?: 'learner' | 'author';
    } & DefaultSession["user"];
  }
  interface User {
    id?: string;
    username?: string;
    name?: string;
    role?: 'learner' | 'author';
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    username?: string;
    role?: 'learner' | 'author';
  }
}

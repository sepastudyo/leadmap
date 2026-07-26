import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";

import { env } from "@/config/env";
import { signInSchema } from "@/lib/validation";
import { createUser, findUserByEmail, verifyPassword } from "@/modules/auth";

/**
 * Auth.js configuration (architecture.md §3, §13.1). No database
 * adapter: the schema (architecture.md §5.2) defines only `users` — no
 * `accounts`, `sessions`, or `verificationTokens` tables — so sessions
 * are JWT-only and identity resolution for both Credentials and OAuth
 * sign-in goes through `modules/auth` directly (see users.ts). This
 * means one email is one `users` row: signing in with Google using the
 * same email as an existing Credentials account will sign in to that
 * same account (both providers verify email ownership; there is no
 * separate account-linking table to record which providers are
 * "linked").
 */
const providers: Provider[] = [
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const parsed = signInSchema.safeParse(credentials);
      if (!parsed.success) return null;

      const user = await findUserByEmail(parsed.data.email);
      if (!user || !user.passwordHash) return null;

      const valid = await verifyPassword(
        parsed.data.password,
        user.passwordHash,
      );
      if (!valid) return null;

      return { id: user.id, email: user.email, name: user.name };
    },
  }),
];

if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
    }),
  );
}

if (env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: env.AUTH_GITHUB_ID,
      clientSecret: env.AUTH_GITHUB_SECRET,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers,
  callbacks: {
    async signIn({ user, account }) {
      // Credentials identity is already resolved in `authorize` above.
      if (!account || account.provider === "credentials") return true;

      if (!user.email) return false;

      const existing = await findUserByEmail(user.email);
      if (existing) return true;

      await createUser({
        email: user.email,
        name: user.name ?? user.email,
        passwordHash: null,
        authProvider: account.provider,
      });

      return true;
    },
    async jwt({ token, user }) {
      // On initial sign-in, re-resolve against `users` by email so
      // `token.sub` is always our internal uuid — for OAuth providers,
      // `user.id` here is the provider's own id, not ours.
      if (user?.email) {
        const dbUser = await findUserByEmail(user.email);
        if (dbUser) token.sub = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});

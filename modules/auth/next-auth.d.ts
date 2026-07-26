import { type DefaultSession } from "next-auth";

/**
 * Augments Auth.js's default Session/JWT shape with our internal user
 * id (a `users.id` uuid, not a provider-specific id — see the `jwt`
 * callback in auth.ts).
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string;
  }
}

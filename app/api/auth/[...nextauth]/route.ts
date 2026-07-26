import { handlers } from "@/auth";

/**
 * Auth.js's required catch-all route for sign-in/callback/session
 * endpoints. Not a "page" — no sign-in UI is implemented yet
 * (architecture.md §17 Sprint 1).
 */
export const { GET, POST } = handlers;

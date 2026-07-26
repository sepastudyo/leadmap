/**
 * Domain logic for authentication: session helpers, account policies
 * (architecture.md §3, §13.2). Framework-free by convention — no
 * Next.js/React imports here. The Auth.js wiring itself lives in
 * `auth.ts` at the project root.
 */
export * from "./password";
export * from "./users";

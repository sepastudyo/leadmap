import { NextResponse } from "next/server";

import { auth } from "@/auth";

/**
 * Edge auth gate (architecture.md §2 "Edge middleware: auth gate").
 * Named `proxy.ts`, not `middleware.ts` — Next.js 16 renamed the file
 * convention (see node_modules/next/dist/docs/.../file-conventions/proxy.md);
 * `middleware.ts` is deprecated. The exported function itself is
 * unchanged: `auth(...)` from Auth.js returns a standard Next.js
 * request handler regardless of what the file/export is named.
 *
 * This is a first line of defense, not the only one — every
 * authenticated Server Component/Route Handler re-checks the session
 * itself (architecture.md §12.4 "All authenticated endpoints resolve
 * the owning user from the session"), per Next.js's own guidance not to
 * rely on Proxy alone.
 */
const PUBLIC_ROUTES = ["/sign-in", "/sign-up"];

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isPublicRoute = PUBLIC_ROUTES.includes(req.nextUrl.pathname);

  if (!isLoggedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL("/sign-in", req.nextUrl));
  }

  if (isLoggedIn && isPublicRoute) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

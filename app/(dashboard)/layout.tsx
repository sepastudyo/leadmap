import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";

/**
 * Authenticated shell (architecture.md §4 "(dashboard)/ — authenticated
 * shell: dashboard, discovery, business, leads, settings"). The session
 * is re-checked here even though `proxy.ts` already redirects
 * unauthenticated requests away from this route group — Proxy is a
 * first line of defense, not the only one (see the Next.js Proxy file
 * convention docs: "Always verify authentication ... inside each Server
 * Function rather than relying on Proxy alone").
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-border flex items-center justify-between border-b px-6 py-3">
        <nav className="flex items-center gap-4">
          <Link href="/" className="text-sm font-semibold">
            LeadMap
          </Link>
          <Link
            href="/discovery"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            Discovery
          </Link>
          <Link
            href="/leads"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            Leads
          </Link>
          <Link
            href="/settings"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            Settings
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">
            {session.user.email}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/sign-in" });
            }}
          >
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col p-6">{children}</main>
    </div>
  );
}

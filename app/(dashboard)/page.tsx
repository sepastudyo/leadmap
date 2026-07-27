import Link from "next/link";
import { redirect } from "next/navigation";

import { RecentSearchesCard } from "@/components/dashboard/recent-searches-card";
import { auth } from "@/auth";
import {
  countActiveFavoritesByUser,
  getDueFollowUpsForUser,
} from "@/modules/crm";

/**
 * Dashboard — a pull-based landing page (architecture.md §3, §17
 * Sprint 4 Phase 4.5: replace the Sprint 1 placeholder cards with real
 * queries). "Saved leads" and "Follow-ups due" read `favorites` through
 * `modules/crm`'s existing repository/orchestration layer — the same
 * "RSC reads directly, no API round-trip" pattern the Business Detail
 * Page and Leads page already use. Follow-ups due is exactly
 * architecture.md §20's "Reconciled inconsistency 2": a query at render
 * time, not a scheduler or notification.
 *
 * "Recent searches" was left as a placeholder through Sprint 4 —
 * architecture.md §3 describes it as reading from "`search_cache`
 * owned by the user," but §5.1/§5.2 define `search_cache` as the
 * GLOBAL shared cache plane with no `user_id` column at all. Resolved
 * in Sprint 7 (Phases 7.1–7.4) via a separate USER-plane
 * `search_history` table recording who searched what, when — leaving
 * `search_cache` itself, and Cache First's dedup guarantee, untouched.
 * Unlike its two siblings, `RecentSearchesCard` is a client component
 * that fetches `GET /api/discovery/recent-searches` (Phase 7.3) rather
 * than an RSC direct read — a deliberate choice for this feature, not a
 * pattern change for the page as a whole.
 */
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const [savedLeadsCount, dueFollowUps] = await Promise.all([
    countActiveFavoritesByUser(session.user.id),
    getDueFollowUpsForUser(session.user.id),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">
          Welcome{session.user.name ? `, ${session.user.name}` : ""}
        </h1>
        <p className="text-muted-foreground text-sm">
          Your saved leads and follow-ups appear here as soon as you favorite a
          business.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <RecentSearchesCard />

        <div className="border-border rounded-lg border p-4">
          <h2 className="text-sm font-medium">Saved leads</h2>
          <p className="mt-1 text-3xl font-semibold">{savedLeadsCount}</p>
          <Link
            href="/leads"
            className="text-primary mt-2 inline-block text-sm underline-offset-4 hover:underline"
          >
            View all leads →
          </Link>
        </div>

        <div className="border-border rounded-lg border p-4 sm:col-span-2 lg:col-span-1">
          <h2 className="text-sm font-medium">Follow-ups due</h2>
          {dueFollowUps.length === 0 ? (
            <p className="text-muted-foreground mt-1 text-sm">
              No follow-ups due today.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {dueFollowUps.map((item) => (
                <li key={item.favoriteId} className="text-sm">
                  <Link
                    href={`/business/${item.businessId}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {item.businessName}
                  </Link>
                  <span className="text-muted-foreground">
                    {" "}
                    · {item.followUpAt}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

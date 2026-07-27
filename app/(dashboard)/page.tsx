import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  countActiveFavoritesByUser,
  getDueFollowUpsForUser,
} from "@/modules/crm";

/**
 * Dashboard — a pull-based landing page (architecture.md §3, §17
 * Sprint 4 Phase 4.5: replace the Sprint 1 placeholder cards with real
 * queries). "Saved leads" and "Follow-ups due" now read `favorites`
 * through `modules/crm`'s existing repository/orchestration layer —
 * the same "RSC reads directly, no API round-trip" pattern the
 * Business Detail Page and Leads page already use. Follow-ups due is
 * exactly architecture.md §20's "Reconciled inconsistency 2": a query
 * at render time, not a scheduler or notification.
 *
 * "Recent searches" is left as a placeholder — architecture.md §3
 * describes it as reading from "`search_cache` owned by the user," but
 * §5.1/§5.2 define `search_cache` as the GLOBAL shared cache plane with
 * no `user_id` column at all (confirmed against
 * `db/schema/search-cache.ts`). That's an inconsistency inside
 * architecture.md itself, not a Sprint 4 gap — implementing it would
 * require either a schema change (a new user-plane search-history
 * table, or adding ownership to the shared cache, which would break
 * Cache First's "one Google call, not two" dedup guarantee) that isn't
 * part of this phase's approved scope. Flagged for a decision rather
 * than silently worked around.
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
        <div className="border-border rounded-lg border border-dashed p-4">
          <h2 className="text-sm font-medium">Recent searches</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Search history isn&apos;t tracked per user yet — run a search from
            Discovery.
          </p>
        </div>

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

import { redirect } from "next/navigation";

import { LeadsView } from "@/components/leads/leads-view";
import { auth } from "@/auth";
import { getLeadsForUser } from "@/modules/crm";

const PAGE_SIZE = 20;

/**
 * `/leads` (architecture.md §4 "(dashboard)/leads/", §17 Sprint 4
 * Phase 4.4). Thin RSC shell — the first page of results is read
 * directly through `modules/crm`'s orchestration layer (matching the
 * rest of this app's "RSC reads directly, no API round-trip for the
 * initial load" pattern, e.g. the Business Detail Page); `LeadsView`
 * takes over from there for pagination/sorting/filtering/selection,
 * all client-side interactivity a Server Component can't do.
 */
export default async function LeadsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const { items, totalCount } = await getLeadsForUser(session.user.id, {
    limit: PAGE_SIZE,
    offset: 0,
  });

  return (
    <LeadsView
      initialLeads={items}
      initialTotalCount={totalCount}
      pageSize={PAGE_SIZE}
    />
  );
}

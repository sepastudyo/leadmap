import { auth } from "@/auth";

/**
 * Dashboard — a pull-based landing page (architecture.md §3, §17
 * Sprint 1: "Build an empty dashboard shell (RSC)"). The real sections
 * (recent searches, saved leads, follow-ups due) read from
 * `search_cache` and `favorites`, which don't exist until Sprint 2
 * (Business Discovery) and Sprint 4 (Lead Organization) — so this
 * renders their empty states only, with no query against tables that
 * aren't there yet.
 */
export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">
          Welcome{session?.user?.name ? `, ${session.user.name}` : ""}
        </h1>
        <p className="text-muted-foreground text-sm">
          Your recent searches, saved leads, and follow-ups will appear here
          once Business Discovery and Lead Organization ship.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <EmptyCard
          title="Recent searches"
          description="Nothing yet — run a search once Business Discovery ships (Sprint 2)."
        />
        <EmptyCard
          title="Saved leads"
          description="Nothing yet — favorite a business once Lead Organization ships (Sprint 4)."
        />
        <EmptyCard
          title="Follow-ups due"
          description="Nothing yet — set a follow-up date once Lead Organization ships (Sprint 4)."
        />
      </div>
    </div>
  );
}

function EmptyCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border-border rounded-lg border border-dashed p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="text-muted-foreground mt-1 text-sm">{description}</p>
    </div>
  );
}

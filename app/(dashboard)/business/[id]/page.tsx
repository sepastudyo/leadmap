import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AiAuditPanel } from "@/components/business/ai-audit-panel";
import { AnalysisSummary } from "@/components/business/analysis-summary";
import { BusinessSignals } from "@/components/business/business-signals";
import type { FavoriteDto } from "@/components/business/favorite-panel";
import { FavoritePanel } from "@/components/business/favorite-panel";
import { LeadScoreCard } from "@/components/business/lead-score-card";
import type { NoteDto } from "@/components/business/notes-panel";
import { NotesPanel } from "@/components/business/notes-panel";
import { OpportunityPanel } from "@/components/business/opportunity-panel";
import { RefreshPanel } from "@/components/business/refresh-panel";
import { auth } from "@/auth";
import {
  getFavoriteByUserAndBusiness,
  getNotesForBusiness,
} from "@/modules/crm";
import { getBusinessById } from "@/modules/discovery";
import {
  BusinessNotFoundError,
  getOrComputeLeadScore,
  getOrRefreshPlaceDetails,
  getOrRunWebsiteAnalysis,
} from "@/modules/intelligence";
import { getMaskedSettings } from "@/modules/settings";

/**
 * `/business/[id]` (architecture.md §4 "(dashboard)/business/[id]/",
 * §17 Sprint 3: "business detail page: analysis results, explainable
 * Lead Score, business signals" — originally "Google Business signals";
 * renamed after the OpenStreetMap migration since the data no longer
 * comes from Google). This *is* "opening a
 * business" (§3) — the on-demand trigger every read-through
 * orchestration function in `modules/intelligence` (Place Details,
 * Website Analysis, Lead Score) was built to be called from but
 * nothing called until now. A thin Server Component per architecture's
 * own "app/ is thin ... contain no business rules" and "React Server
 * Components: data-heavy views (... business detail ...) render on the
 * server" (§4, §13.4).
 */
export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const { id } = await params;

  const business = await getBusinessById(id);
  if (!business) notFound();

  let current = business;
  try {
    current = await getOrRefreshPlaceDetails(id);
  } catch (error) {
    if (!(error instanceof BusinessNotFoundError)) {
      throw error;
    }
  }

  const analysis = await getOrRunWebsiteAnalysis(id, current.websiteUrl);
  const score = await getOrComputeLeadScore(id, current, analysis);

  // Sprint 4 Phase 4.3 (architecture.md §3 Lead Organization): reads go
  // straight through the Phase 4.1 repository/orchestration layer, the
  // same "RSC reads directly, no API round-trip" pattern the rest of
  // this page already uses — only the client-side mutations (favorite
  // toggle, status/priority/follow-up, notes) go through the Phase 4.2
  // API, since those need interactivity a Server Component can't do.
  const favoriteRow = await getFavoriteByUserAndBusiness(session.user.id, id);
  const favorite: FavoriteDto | null = favoriteRow && {
    id: favoriteRow.id,
    status: favoriteRow.status,
    priority: favoriteRow.priority,
    followUpAt: favoriteRow.followUpAt,
  };

  const noteRows = await getNotesForBusiness(session.user.id, id);
  const notes: NoteDto[] = noteRows.map((note) => ({
    id: note.id,
    body: note.body,
    pinned: note.pinned,
    createdAt: note.createdAt.toISOString(),
  }));

  // Sprint 5 Phase 5.5 (architecture.md §11 "AI features appear only
  // when the user has stored a valid provider key"). A masked settings
  // read (already existing, no new provider call) — not the same as
  // Phase 5.2/5.3's `AiKeyMissingError` fallback inside each panel,
  // which stays as defense-in-depth for a key removed after this page
  // already rendered.
  const settings = await getMaskedSettings(session.user.id);
  const hasAiKey = settings.aiProvider !== null && settings.hasAiApiKey;

  const location = [current.district, current.city, current.country]
    .filter((part): part is string => Boolean(part))
    .join(", ");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{current.name}</h1>
          <p className="text-muted-foreground text-sm">
            {current.category}
            {location && ` · ${location}`}
          </p>
          <p className="text-muted-foreground text-sm">{current.address}</p>
          <div className="mt-1 flex flex-wrap gap-3 text-sm">
            {current.phone && <span>{current.phone}</span>}
            {current.websiteUrl && (
              <a
                href={current.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-4"
              >
                {current.websiteUrl}
              </a>
            )}
          </div>
        </div>

        <RefreshPanel businessId={id} />
      </div>

      <FavoritePanel businessId={id} initialFavorite={favorite} />

      <div className="grid gap-4 lg:grid-cols-3">
        <LeadScoreCard score={score} />
        <BusinessSignals business={current} />
      </div>

      <AnalysisSummary
        analysis={analysis}
        hasWebsite={current.websiteUrl !== null}
      />

      {hasAiKey ? (
        <>
          <AiAuditPanel businessId={id} />
          <OpportunityPanel businessId={id} />
        </>
      ) : (
        <p className="border-border bg-muted/40 rounded-lg border border-dashed p-3 text-sm">
          Save an AI provider API key in{" "}
          <Link
            href="/settings"
            className="text-primary underline underline-offset-4"
          >
            Settings
          </Link>{" "}
          to unlock AI Audit and Opportunity Reasoning.
        </p>
      )}

      <NotesPanel businessId={id} initialNotes={notes} />
    </div>
  );
}

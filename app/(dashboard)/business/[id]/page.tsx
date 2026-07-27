import { notFound, redirect } from "next/navigation";

import { AnalysisSummary } from "@/components/business/analysis-summary";
import { GoogleSignals } from "@/components/business/google-signals";
import { LeadScoreCard } from "@/components/business/lead-score-card";
import { auth } from "@/auth";
import { getBusinessById } from "@/modules/discovery";
import {
  BusinessNotFoundError,
  GoogleApiKeyMissingError,
  getOrComputeLeadScore,
  getOrRefreshPlaceDetails,
  getOrRunWebsiteAnalysis,
} from "@/modules/intelligence";

/**
 * `/business/[id]` (architecture.md §4 "(dashboard)/business/[id]/",
 * §17 Sprint 3: "business detail page: analysis results, explainable
 * Lead Score, Google Business signals"). This *is* "opening a
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
  let googleApiKeyMissing = false;
  try {
    current = await getOrRefreshPlaceDetails(session.user.id, id);
  } catch (error) {
    if (error instanceof GoogleApiKeyMissingError) {
      googleApiKeyMissing = true;
    } else if (!(error instanceof BusinessNotFoundError)) {
      throw error;
    }
  }

  const analysis = await getOrRunWebsiteAnalysis(id, current.websiteUrl);
  const score = await getOrComputeLeadScore(id, current, analysis);

  const location = [current.district, current.city, current.country]
    .filter((part): part is string => Boolean(part))
    .join(", ");

  return (
    <div className="flex flex-1 flex-col gap-6">
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

      {googleApiKeyMissing && (
        <p className="border-border bg-muted/40 rounded-lg border border-dashed p-3 text-sm">
          Save a Google API key in Settings to refresh phone/website/hours for
          this business.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <LeadScoreCard score={score} />
        <GoogleSignals business={current} />
      </div>

      <AnalysisSummary
        analysis={analysis}
        hasWebsite={current.websiteUrl !== null}
      />
    </div>
  );
}

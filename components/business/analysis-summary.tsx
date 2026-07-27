import type { AssembledAnalysis } from "@/modules/intelligence";

export type AnalysisSummaryProps = {
  analysis: AssembledAnalysis | null;
  hasWebsite: boolean;
};

function StatCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border rounded-lg border p-4">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="text-muted-foreground mt-2 flex flex-col gap-1 text-sm">
        {children}
      </div>
    </div>
  );
}

const SOCIAL_PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X",
  tiktok: "TikTok",
  youtube: "YouTube",
};

/**
 * Website Analysis results (architecture.md §17 Sprint 3 deliverable:
 * "business detail page: analysis results"). One card per §9.1 stage
 * group — SSL, SEO, CMS/Technology, Tracking, Social, robots/sitemap —
 * reading directly from the persisted `AssembledAnalysis`, nothing
 * recomputed here.
 */
export function AnalysisSummary({
  analysis,
  hasWebsite,
}: AnalysisSummaryProps) {
  if (!analysis) {
    return (
      <div className="border-border rounded-lg border border-dashed p-4">
        <h2 className="text-sm font-medium">Website analysis</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {hasWebsite
            ? "Analysis unavailable — the site may be unreachable or blocking automated requests."
            : "This business has no website on file."}
        </p>
      </div>
    );
  }

  const socialLinks: Record<string, string | null> = {
    facebook: analysis.social.facebook,
    instagram: analysis.social.instagram,
    linkedin: analysis.social.linkedin,
    x: analysis.social.x,
    tiktok: analysis.social.tiktok,
    youtube: analysis.social.youtube,
  };
  const socialFound = Object.entries(SOCIAL_PLATFORM_LABELS).filter(
    ([key]) => socialLinks[key] !== null,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Website analysis</h2>
        <span className="text-muted-foreground text-xs">
          {analysis.status === "ok"
            ? "Complete"
            : analysis.status === "partial"
              ? "Partial — one or more stages degraded"
              : "Failed"}{" "}
          · analyzed {analysis.analyzedAt.toLocaleDateString()}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard title="SSL">
          <span>
            {analysis.ssl.httpsPresent ? "HTTPS present" : "No HTTPS"}
          </span>
          {analysis.ssl.certificate && (
            <>
              <span>
                Issuer: {analysis.ssl.certificate.issuer ?? "Unknown"}
              </span>
              <span>
                {analysis.ssl.certificate.isValid ? "Valid" : "Not trusted"}
                {analysis.ssl.certificate.daysUntilExpiry !== null &&
                  ` · expires in ${analysis.ssl.certificate.daysUntilExpiry}d`}
              </span>
            </>
          )}
        </StatCard>

        <StatCard title="SEO">
          <span>
            Title: {analysis.seo.title.present ? "present" : "missing"}
            {analysis.seo.title.present &&
              (analysis.seo.title.withinRecommendedLength
                ? " (good length)"
                : " (poor length)")}
          </span>
          <span>
            H1:{" "}
            {analysis.seo.headings.hasSingleH1 ? "single H1" : "not single H1"}
          </span>
          <span>{analysis.seo.indexable ? "Indexable" : "Noindex set"}</span>
        </StatCard>

        <StatCard title="CMS & technology">
          <span>
            CMS:{" "}
            {analysis.cms.detected.length > 0
              ? analysis.cms.detected.map((match) => match.name).join(", ")
              : "Not detected"}
          </span>
          <span>
            Tech:{" "}
            {analysis.cms.technology.detected.length > 0
              ? analysis.cms.technology.detected
                  .map((match) => match.name)
                  .join(", ")
              : "Not detected"}
          </span>
        </StatCard>

        <StatCard title="Tracking">
          {analysis.tracking.detected.length > 0 ? (
            analysis.tracking.detected.map((match) => (
              <span key={match.name}>{match.name}</span>
            ))
          ) : (
            <span>None detected</span>
          )}
        </StatCard>

        <StatCard title="Social presence">
          {socialFound.length > 0 ? (
            socialFound.map(([key, label]) => <span key={key}>{label}</span>)
          ) : (
            <span>No social links found</span>
          )}
          {analysis.social.missingMajors.length > 0 && (
            <span>
              Missing:{" "}
              {analysis.social.missingMajors
                .map((key) => SOCIAL_PLATFORM_LABELS[key])
                .join(", ")}
            </span>
          )}
        </StatCard>

        <StatCard title="robots.txt & sitemap">
          <span>
            robots.txt:{" "}
            {analysis.robots.present
              ? analysis.robots.disallowsAll
                ? "present (disallows all)"
                : "present"
              : "not found"}
          </span>
          <span>
            sitemap.xml:{" "}
            {analysis.sitemap.present
              ? `present (${analysis.sitemap.urlCount} URLs)`
              : "not found"}
          </span>
        </StatCard>
      </div>
    </div>
  );
}

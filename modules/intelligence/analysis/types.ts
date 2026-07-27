import "server-only";

import type { CmsDetectionResult } from "./cms";
import type { FetchedResource } from "./guarded-fetch";
import type { PageMetadata } from "./metadata";
import type { RobotsEvaluation, RobotsTxtResult } from "./robots";
import type { SeoAnalysis } from "./seo";
import type { SitemapEvaluation, SitemapResult } from "./sitemap";
import type { SocialLinksResult } from "./social-links";
import type { OpenGraphData, TwitterCardData } from "./social-meta";
import type { SslAnalysis } from "./ssl";
import type { StructuredDataResult } from "./structured-data";
import type { TechnologyDetectionResult } from "./technology";
import type { TrackingDetectionResult } from "./tracking";

/**
 * `AcquisitionResult`/`PageAnalysis` live in their own file, separate
 * from `index.ts`, so `assemble.ts` ([12 Assemble]) can import
 * `PageAnalysis` without creating a circular module dependency —
 * `index.ts` imports the *value* `assembleAnalysis` from `assemble.ts`,
 * so `assemble.ts` importing a type back from `index.ts` would form a
 * cycle even though the import itself is type-only. Importing from this
 * file instead avoids the cycle entirely rather than relying on
 * type-only-import erasure to make a cycle harmless.
 */

export type AcquisitionResult = {
  page: FetchedResource;
  robots: RobotsTxtResult | null;
  sitemap: SitemapResult | null;
};

export type PageAnalysis = {
  acquisition: AcquisitionResult;
  metadata: PageMetadata;
  seo: SeoAnalysis;
  openGraph: OpenGraphData;
  twitterCard: TwitterCardData;
  structuredData: StructuredDataResult;
  ssl: SslAnalysis;
  cms: CmsDetectionResult;
  tracking: TrackingDetectionResult;
  technology: TechnologyDetectionResult;
  robotsEvaluation: RobotsEvaluation;
  sitemapEvaluation: SitemapEvaluation;
  social: SocialLinksResult;
};

import "server-only";
import { eq } from "drizzle-orm";

import { analysisHistory, websiteAnalyses } from "@/db/schema";
import { db, type DbClient } from "@/lib/db";

import type { AssembledAnalysis } from "./assemble";

/**
 * [13 Persist] (architecture.md §9.1 "upsert website_analyses (current)
 * + expires_at; (optional) append prior copy to analysis_history on
 * manual re-run"). `businesses 1─1 website_analyses` (§5.3) — one
 * current row per business, upserted on the unique `business_id`.
 *
 * Reads the existing row first, inside the same transaction, so its
 * exact prior content can be archived to `analysis_history` before
 * being overwritten — "on manual re-run" in architecture.md's wording
 * just means "whenever this runs again for a business that already has
 * a row"; there's no separate manual-vs-automatic re-run distinction
 * elsewhere in the pipeline; every call to `persistAnalysis` is
 * inherently a fresh, user-triggered run (On-Demand Architecture — §0).
 */
export async function persistAnalysis(
  businessId: string,
  assembled: AssembledAnalysis,
  dbClient: DbClient = db,
) {
  return dbClient.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(websiteAnalyses)
      .where(eq(websiteAnalyses.businessId, businessId))
      .limit(1);

    if (existing) {
      await tx.insert(analysisHistory).values({
        businessId,
        analysis: existing,
        contentHash: existing.contentHash,
        analyzerVersion: existing.analyzerVersion,
      });
    }

    const [row] = await tx
      .insert(websiteAnalyses)
      .values({ businessId, ...assembled })
      .onConflictDoUpdate({
        target: websiteAnalyses.businessId,
        set: { ...assembled },
      })
      .returning();

    if (!row) throw new Error("persistAnalysis did not return a row");
    return row;
  });
}

/**
 * Reads the current `website_analyses` row for a business — `null` if
 * none has ever been persisted. Callers decide freshness themselves via
 * `expiresAt` (the same `DbClient`-optional, freshness-at-the-call-site
 * pattern `getOrRefreshPlaceDetails` already established).
 */
export async function getWebsiteAnalysis(
  businessId: string,
  dbClient: DbClient = db,
) {
  const [row] = await dbClient
    .select()
    .from(websiteAnalyses)
    .where(eq(websiteAnalyses.businessId, businessId))
    .limit(1);

  return row ?? null;
}

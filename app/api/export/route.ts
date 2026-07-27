import { PassThrough, Readable } from "node:stream";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { FAVORITE_STATUS_LABELS } from "@/components/leads/status-labels";
import { jsonError, requireSession } from "@/lib/http";
import { exportQuerySchema } from "@/lib/validation";
import { getLeadsByIds, type LeadListItem } from "@/modules/crm";

const COLUMNS: { header: string; key: keyof RowValues; width: number }[] = [
  { header: "Business Name", key: "businessName", width: 32 },
  { header: "Status", key: "status", width: 16 },
  { header: "Priority", key: "priority", width: 10 },
  { header: "Follow-up Date", key: "followUpAt", width: 16 },
  { header: "Lead Score", key: "leadScore", width: 12 },
];

type RowValues = {
  businessName: string;
  status: string;
  priority: number | string;
  followUpAt: string;
  leadScore: number | string;
};

function toRowValues(lead: LeadListItem): RowValues {
  return {
    businessName: lead.businessName,
    status: FAVORITE_STATUS_LABELS[lead.status],
    priority: lead.priority ?? "",
    followUpAt: lead.followUpAt ?? "",
    leadScore: lead.leadScore ?? "",
  };
}

function buildWorkbook(leads: LeadListItem[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Leads");
  worksheet.columns = COLUMNS;

  for (const lead of leads) {
    worksheet.addRow(toRowValues(lead));
  }

  return workbook;
}

/**
 * `GET /api/export` (architecture.md §12.5 "Stream CSV/XLSX of selected
 * leads"; Sprint 4 Phase 4.6). `ids` is the Leads page's existing row
 * selection (Phase 4.4) — this reads exactly those favorites, scoped to
 * the signed-in user (`getLeadsByIds`), never a fresh/unbounded query.
 *
 * Uses `exceljs`, not the `xlsx` (SheetJS) package architecture.md §19
 * names — SheetJS's public npm releases carry unpatched prototype-
 * pollution/ReDoS advisories with no fixed version available on the
 * registry. `exceljs` covers the same "XLSX/CSV generation in-request,
 * no storage" requirement with a lower-severity, indirect-only advisory
 * (see the Phase 4.6 discussion), and its `stream.xlsx.WorkbookWriter`
 * is a genuine row-streaming writer — not used here, though: with rows
 * already bounded to `EXPORT_MAX_ROWS` and fetched in one query, the
 * whole workbook is built in memory first, then `workbook.csv.write` /
 * `workbook.xlsx.write` serialize it to a stream. What's genuinely
 * streamed is the HTTP response body itself (bytes reach the client as
 * the serializer produces them), not per-row generation — worth being
 * precise about rather than overclaiming full end-to-end streaming.
 */
export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { userId, requestId } = session;

  const { searchParams } = new URL(request.url);
  const parsed = exportQuerySchema.safeParse({
    ids: searchParams.get("ids") ?? undefined,
    format: searchParams.get("format") ?? undefined,
  });

  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid export request.",
      requestId,
      422,
      { details: parsed.error.issues },
    );
  }

  const { ids, format } = parsed.data;
  const leads = await getLeadsByIds(userId, ids);

  if (leads.length === 0) {
    return jsonError(
      "NOT_FOUND",
      "No matching leads to export.",
      requestId,
      404,
    );
  }

  const workbook = buildWorkbook(leads);
  const passThrough = new PassThrough();
  const body = Readable.toWeb(
    passThrough,
  ) as unknown as ReadableStream<Uint8Array>;

  const write =
    format === "xlsx"
      ? workbook.xlsx.write(passThrough)
      : workbook.csv.write(passThrough);
  void write.then(
    () => passThrough.end(),
    (error: unknown) => passThrough.destroy(error as Error),
  );

  const contentType =
    format === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "text/csv; charset=utf-8";

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="leads.${format}"`,
    },
  });
}

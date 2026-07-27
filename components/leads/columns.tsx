"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { Checkbox } from "@/components/ui/checkbox";

import { FAVORITE_STATUS_LABELS } from "./status-labels";
import type { LeadRow } from "./types";

/**
 * Column definitions for the Leads table (architecture.md §17 Sprint 4:
 * "Display: Business Name, Status, Priority, Follow-up Date, Lead Score
 * (if available)"). Sorting enabled on every data column except the
 * selection checkbox, mirroring `components/discovery/columns.tsx`.
 */
export const leadsColumns: ColumnDef<LeadRow>[] = [
  {
    id: "select",
    size: 40,
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={
          table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()
        }
        onCheckedChange={(checked) =>
          table.toggleAllPageRowsSelected(checked === true)
        }
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(checked === true)}
        aria-label={`Select ${row.original.businessName}`}
      />
    ),
  },
  {
    id: "businessName",
    accessorKey: "businessName",
    header: "Business Name",
    size: 260,
    cell: ({ row }) => (
      <Link
        href={`/business/${row.original.businessId}`}
        className="font-medium underline-offset-4 hover:underline"
      >
        {row.original.businessName}
      </Link>
    ),
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    size: 130,
    cell: ({ row }) => FAVORITE_STATUS_LABELS[row.original.status],
  },
  {
    id: "priority",
    // `sortUndefined` only special-cases `undefined`, not `null` — see
    // `components/discovery/columns.tsx`'s `rating` column for the same
    // normalization and why.
    accessorFn: (row) => row.priority ?? undefined,
    sortUndefined: "last",
    header: "Priority",
    size: 100,
    cell: ({ row }) => row.original.priority ?? "—",
  },
  {
    id: "followUpAt",
    accessorFn: (row) => row.followUpAt ?? undefined,
    sortUndefined: "last",
    header: "Follow-up Date",
    size: 150,
    cell: ({ row }) => row.original.followUpAt ?? "—",
  },
  {
    id: "leadScore",
    accessorFn: (row) => row.leadScore ?? undefined,
    sortUndefined: "last",
    header: "Lead Score",
    size: 120,
    cell: ({ row }) => row.original.leadScore ?? "—",
  },
];

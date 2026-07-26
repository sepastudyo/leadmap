"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { Checkbox } from "@/components/ui/checkbox";

import type { DiscoveryBusiness } from "./types";

function formatRating(business: DiscoveryBusiness): string {
  if (business.googleRating === null) return "—";
  const reviews =
    business.googleReviewCount === null
      ? ""
      : ` (${business.googleReviewCount})`;
  return `${business.googleRating.toFixed(1)}${reviews}`;
}

/**
 * Column definitions for the Discovery results table. No sort/filter
 * handlers — this phase renders columns only (see docs/sprint-2.md).
 */
export const discoveryColumns: ColumnDef<DiscoveryBusiness>[] = [
  {
    id: "select",
    size: 40,
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
        aria-label={`Select ${row.original.name}`}
      />
    ),
  },
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    size: 240,
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    id: "category",
    accessorKey: "category",
    header: "Category",
    size: 160,
  },
  {
    id: "city",
    accessorKey: "city",
    header: "City",
    size: 140,
  },
  {
    id: "district",
    accessorKey: "district",
    header: "District",
    size: 140,
    cell: ({ row }) => row.original.district ?? "—",
  },
  {
    id: "rating",
    header: "Rating",
    size: 110,
    cell: ({ row }) => formatRating(row.original),
  },
  {
    id: "address",
    accessorKey: "address",
    header: "Address",
    size: 320,
  },
];

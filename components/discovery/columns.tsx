"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

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
 * Column definitions for the Discovery results table. Sorting
 * (architecture.md §8 "TABLE VIEW sortable") is enabled on every data
 * column except the selection checkbox — sorting by a checkbox isn't
 * meaningful, so that one opts out explicitly.
 */
export const discoveryColumns: ColumnDef<DiscoveryBusiness>[] = [
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
        aria-label={`Select ${row.original.name}`}
      />
    ),
  },
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    size: 240,
    cell: ({ row }) => (
      <Link
        href={`/business/${row.original.id}`}
        className="font-medium underline-offset-4 hover:underline"
      >
        {row.original.name}
      </Link>
    ),
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
    // `sortUndefined` only special-cases `undefined`, not `null`
    // (TanStack Table's row-sorting internals check `=== undefined`
    // exactly) — so the `null` DB value has to be normalized here.
    // Unrated businesses sort last regardless of direction: an unrated
    // business isn't "worse" than a 0-star one, it's simply unranked.
    accessorFn: (row) => row.googleRating ?? undefined,
    sortUndefined: "last",
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

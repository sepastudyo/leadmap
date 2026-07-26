import { DiscoveryView } from "@/components/discovery/discovery-view";

/**
 * `/discovery` (architecture.md §4 "(dashboard)/discovery/"). Thin RSC
 * shell — auth is already gated by `app/(dashboard)/layout.tsx`; all
 * the actual interactivity (search form, table, pagination, selection)
 * lives in the client component, since none of it is a server-time
 * data read.
 */
export default function DiscoveryPage() {
  return <DiscoveryView />;
}

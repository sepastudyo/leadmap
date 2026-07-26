"use client";

import * as React from "react";
import Link from "next/link";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { OnChangeFn, RowSelectionState } from "@tanstack/react-table";

import { cn } from "@/lib/utils";

import type { DiscoveryBusiness } from "./types";

/**
 * Map View (architecture.md §3 "Table View ... and a Map View
 * (Google Maps JS with markers)", §7.1, §7.2). Not exported as the
 * default entry point for `discovery-view.tsx` to import directly —
 * see the `next/dynamic({ ssr: false })` wrapper there, which is what
 * makes this lazy: neither this component's code nor the actual Maps
 * JS bundle downloads until the user first switches to the Map tab.
 *
 * Consumes the exact same `businesses` / `rowSelection` state
 * `DiscoveryView` already passes to `DataTable` — no second fetch, no
 * separate selection model ("the table and the map must consume the
 * same source of truth").
 *
 * Classic `google.maps.Marker`, not `AdvancedMarkerElement`: Google's
 * newer marker API requires a Map ID (configured in Google Cloud
 * Console), which isn't part of this app's settings model (§5.2 has no
 * field for it) — `Marker` remains fully supported and needs no such
 * setup, so it's the pragmatic choice here, not a simplification of
 * anything this phase actually requires.
 */

const VIEWPORT_STORAGE_KEY = "leadmap:discovery:map-viewport";
const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 20, lng: 0 };
const DEFAULT_ZOOM = 2;
const SELECTED_MARKER_ICON =
  "https://maps.google.com/mapfiles/ms/icons/blue-dot.png";

type StoredViewport = { lat: number; lng: number; zoom: number };

function readStoredViewport(): StoredViewport | null {
  try {
    const raw = window.sessionStorage.getItem(VIEWPORT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredViewport) : null;
  } catch {
    return null;
  }
}

function writeStoredViewport(viewport: StoredViewport) {
  try {
    window.sessionStorage.setItem(
      VIEWPORT_STORAGE_KEY,
      JSON.stringify(viewport),
    );
  } catch {
    // Private browsing / storage quota can throw — viewport persistence
    // is a nicety, never worth failing the map over.
  }
}

function buildInfoWindowContent(business: DiscoveryBusiness): HTMLElement {
  const container = document.createElement("div");
  container.style.fontSize = "13px";
  container.style.maxWidth = "220px";

  // `textContent`, not `innerHTML` — business name/category ultimately
  // come from Google's API response, which architecture.md §13.3 treats
  // as untrusted; this can't be an injection vector either way.
  const title = document.createElement("strong");
  title.textContent = business.name;

  const category = document.createElement("div");
  category.textContent = business.category;
  category.style.color = "#6b7280";

  container.append(title, category);
  return container;
}

let apiOptionsSet = false;

type MapLibraries = {
  Marker: typeof google.maps.Marker;
  InfoWindow: typeof google.maps.InfoWindow;
  LatLngBounds: typeof google.maps.LatLngBounds;
};

type LoadState = "loading" | "error" | "ready";

export type MapViewProps = {
  businesses: DiscoveryBusiness[];
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  getRowId: (business: DiscoveryBusiness) => string;
  className?: string;
};

export default function MapView({
  businesses,
  rowSelection,
  onRowSelectionChange,
  getRowId,
  className,
}: MapViewProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<google.maps.Map | null>(null);
  const librariesRef = React.useRef<MapLibraries | null>(null);
  const infoWindowRef = React.useRef<google.maps.InfoWindow | null>(null);
  const markersRef = React.useRef<globalThis.Map<string, google.maps.Marker>>(
    new globalThis.Map(),
  );
  const didFitBoundsRef = React.useRef(false);

  const [state, setState] = React.useState<LoadState>("loading");
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Init the map once. `businesses`/`rowSelection` are synced in the
  // effect below rather than re-running this — the map instance
  // persists for the component's lifetime.
  React.useEffect(() => {
    let cancelled = false;

    async function init() {
      setState("loading");
      setErrorCode(null);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/discovery/maps-key");
        const json: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const body = json as {
            error?: { code?: string; message?: string };
          } | null;
          setErrorCode(body?.error?.code ?? null);
          throw new Error(body?.error?.message ?? "Could not load the map.");
        }

        const { googleApiKey } = (json as { data: { googleApiKey: string } })
          .data;
        if (cancelled) return;

        // architecture.md §7.2: the browser key, sent to the client by
        // necessity — secured by the referrer restriction the user
        // configures in Google Cloud Console, not by secrecy on our side.
        if (!apiOptionsSet) {
          setOptions({ key: googleApiKey, v: "weekly" });
          apiOptionsSet = true;
        }

        const [mapsLibrary, markerLibrary, coreLibrary] = await Promise.all([
          importLibrary("maps"),
          importLibrary("marker"),
          importLibrary("core"),
        ]);

        if (cancelled || !containerRef.current) return;

        librariesRef.current = {
          Marker: markerLibrary.Marker,
          InfoWindow: mapsLibrary.InfoWindow,
          LatLngBounds: coreLibrary.LatLngBounds,
        };

        const stored = readStoredViewport();
        const map = new mapsLibrary.Map(containerRef.current, {
          center: stored
            ? { lat: stored.lat, lng: stored.lng }
            : DEFAULT_CENTER,
          zoom: stored?.zoom ?? DEFAULT_ZOOM,
          streetViewControl: false,
          mapTypeControl: false,
        });

        // "Map viewport persistence" — remembered across page reloads
        // (sessionStorage) and, since this component stays mounted
        // once opened (see discovery-view.tsx), across Table/Map toggles
        // and new searches within the session too.
        map.addListener("idle", () => {
          const center = map.getCenter();
          const zoom = map.getZoom();
          if (center && zoom !== undefined) {
            writeStoredViewport({ lat: center.lat(), lng: center.lng(), zoom });
          }
        });

        mapRef.current = map;
        infoWindowRef.current = new mapsLibrary.InfoWindow();
        setState("ready");
      } catch (error) {
        if (cancelled) return;
        setState("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load the map.",
        );
      }
    }

    void init();

    const markers = markersRef.current;
    return () => {
      cancelled = true;
      for (const marker of markers.values()) marker.setMap(null);
      markers.clear();
    };
  }, []);

  // Marker rendering + table <-> map synchronization: this effect owns
  // creating/removing markers as `businesses` changes (new search, next
  // page) and reflecting `rowSelection` on marker appearance. A marker
  // click writes back into the same `rowSelection` state the table
  // uses, so selection flows both ways through one shared source of
  // truth.
  React.useEffect(() => {
    const map = mapRef.current;
    const libraries = librariesRef.current;
    if (!map || !libraries || state !== "ready") return;

    const markers = markersRef.current;
    const nextIds = new Set(businesses.map((business) => getRowId(business)));

    for (const [id, marker] of markers) {
      if (!nextIds.has(id)) {
        marker.setMap(null);
        markers.delete(id);
      }
    }

    const bounds = new libraries.LatLngBounds();
    let hasAny = false;

    for (const business of businesses) {
      const id = getRowId(business);
      hasAny = true;
      bounds.extend(business.location);

      let marker = markers.get(id);
      if (!marker) {
        marker = new libraries.Marker({
          position: business.location,
          map,
          title: business.name,
        });
        marker.addListener("click", () => {
          onRowSelectionChange((previous) => ({
            ...previous,
            [id]: !previous[id],
          }));

          const infoWindow = infoWindowRef.current;
          if (infoWindow && marker) {
            infoWindow.setContent(buildInfoWindowContent(business));
            infoWindow.open({ map, anchor: marker });
          }
        });
        markers.set(id, marker);
      }

      const isSelected = Boolean(rowSelection[id]);
      marker.setIcon(isSelected ? SELECTED_MARKER_ICON : null);
      marker.setZIndex(isSelected ? 999 : undefined);
    }

    // Fit bounds once, only when there was no persisted viewport to
    // restore — after that, respect however the user has panned/zoomed
    // rather than yanking the view around on every new search.
    if (hasAny && !didFitBoundsRef.current && !readStoredViewport()) {
      map.fitBounds(bounds);
      didFitBoundsRef.current = true;
    }
  }, [businesses, rowSelection, state, getRowId, onRowSelectionChange]);

  return (
    <div
      className={cn(
        "border-border relative overflow-hidden rounded-lg border",
        className,
      )}
    >
      <div ref={containerRef} className="h-full w-full" />

      {state === "loading" && (
        <div className="bg-background/80 absolute inset-0 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Loading map…</p>
        </div>
      )}

      {state === "error" && (
        <div className="bg-background absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-destructive text-sm">{errorMessage}</p>
          {errorCode === "GOOGLE_API_KEY_MISSING" && (
            <Link
              href="/settings"
              className="text-sm underline underline-offset-4"
            >
              Go to Settings
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

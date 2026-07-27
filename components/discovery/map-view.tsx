"use client";

import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { OnChangeFn, RowSelectionState } from "@tanstack/react-table";

import { cn } from "@/lib/utils";

import type { DiscoveryBusiness } from "./types";

/**
 * Map View (architecture.md §3 "Table View ... and a Map View", §7.1,
 * §7.2 — originally Google Maps JS, migrated to Leaflet + the standard
 * OpenStreetMap tile server, both free and keyless). No API key, no
 * `/api/discovery/maps-key` route (removed) — Leaflet loads as a plain
 * bundled dependency, not a runtime-loaded external script, so there's
 * nothing to fetch a key for before it can render.
 *
 * Consumes the exact same `businesses` / `rowSelection` state
 * `DiscoveryView` already passes to `DataTable` — no second fetch, no
 * separate selection model ("the table and the map must consume the
 * same source of truth"). This component's own external contract
 * (`MapViewProps`) is unchanged from the Google Maps version, so
 * `discovery-view.tsx` needed no changes at all for this migration.
 */

const VIEWPORT_STORAGE_KEY = "leadmap:discovery:map-viewport";
const DEFAULT_CENTER: L.LatLngTuple = [20, 0];
const DEFAULT_ZOOM = 2;

// Leaflet's bundler-friendly default marker geometry (its own default
// icon's dimensions/anchors) — used for both variants below so neither
// looks or behaves inconsistently with the other. Explicit CDN icon
// URLs, the same approach the original Google-based version took with
// its own explicit "blue-dot" marker URL, sidesteps the well-known
// Leaflet-plus-bundler issue where its default icon's *relative* asset
// paths don't resolve correctly.
const MARKER_ICON_SIZE: L.PointExpression = [25, 41];
const MARKER_ICON_ANCHOR: L.PointExpression = [12, 41];
const MARKER_POPUP_ANCHOR: L.PointExpression = [1, -34];
const MARKER_SHADOW_URL =
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: MARKER_SHADOW_URL,
  iconSize: MARKER_ICON_SIZE,
  iconAnchor: MARKER_ICON_ANCHOR,
  popupAnchor: MARKER_POPUP_ANCHOR,
});

const selectedIcon = L.icon({
  iconUrl:
    "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-red.png",
  iconRetinaUrl:
    "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-red.png",
  shadowUrl: MARKER_SHADOW_URL,
  iconSize: MARKER_ICON_SIZE,
  iconAnchor: MARKER_ICON_ANCHOR,
  popupAnchor: MARKER_POPUP_ANCHOR,
});

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

function buildPopupContent(business: DiscoveryBusiness): HTMLElement {
  const container = document.createElement("div");
  container.style.fontSize = "13px";
  container.style.maxWidth = "220px";

  // `textContent`, not `innerHTML` — business name/category ultimately
  // come from the search provider's response, which architecture.md
  // §13.3 treats as untrusted; this can't be an injection vector either
  // way.
  const title = document.createElement("strong");
  title.textContent = business.name;

  const category = document.createElement("div");
  category.textContent = business.category;
  category.style.color = "#6b7280";

  container.append(title, category);
  return container;
}

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
  const mapRef = React.useRef<L.Map | null>(null);
  const markersRef = React.useRef<globalThis.Map<string, L.Marker>>(
    new globalThis.Map(),
  );
  const didFitBoundsRef = React.useRef(false);

  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Init the map once. `businesses`/`rowSelection` are synced in the
  // effect below rather than re-running this — the map instance
  // persists for the component's lifetime. Unlike Google Maps JS (an
  // async script load), Leaflet's `L.map()` is synchronous, so there's
  // no meaningful "loading" state to track — `mapRef.current` is either
  // set by the end of this effect or it isn't (see the `catch` below).
  React.useEffect(() => {
    if (!containerRef.current) return;

    try {
      const stored = readStoredViewport();
      const map = L.map(containerRef.current, {
        center: stored ? [stored.lat, stored.lng] : DEFAULT_CENTER,
        zoom: stored?.zoom ?? DEFAULT_ZOOM,
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // "Map viewport persistence" — remembered across page reloads
      // (sessionStorage) and, since this component stays mounted once
      // opened (see discovery-view.tsx), across Table/Map toggles and
      // new searches within the session too. Leaflet's `moveend` fires
      // once a pan/zoom (including animations) settles, the same
      // "idle" moment Google Maps JS's own `idle` event captured.
      map.on("moveend", () => {
        const center = map.getCenter();
        writeStoredViewport({
          lat: center.lat,
          lng: center.lng,
          zoom: map.getZoom(),
        });
      });

      mapRef.current = map;
    } catch (error) {
      // Reflects a synchronous failure of the `L.map()` call itself
      // (e.g. an unsupported browser) as UI state — there's no external
      // event to defer to here, so an effect-body setState is the only
      // option.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load the map.",
      );
    }

    const markers = markersRef.current;
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markers.clear();
    };
  }, []);

  // Marker rendering + table <-> map synchronization: this effect owns
  // creating/removing markers as `businesses` changes (new search, next
  // page) and reflecting `rowSelection` on marker appearance. A marker
  // click writes back into the same `rowSelection` state the table
  // uses, so selection flows both ways through one shared source of
  // truth. Runs after the init effect above within the same commit, so
  // `mapRef.current` is already populated on the very first pass.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const markers = markersRef.current;
    const nextIds = new Set(businesses.map((business) => getRowId(business)));

    for (const [id, marker] of markers) {
      if (!nextIds.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }

    const bounds = L.latLngBounds([]);
    let hasAny = false;

    for (const business of businesses) {
      const id = getRowId(business);
      hasAny = true;
      bounds.extend([business.location.lat, business.location.lng]);

      let marker = markers.get(id);
      if (!marker) {
        marker = L.marker([business.location.lat, business.location.lng], {
          title: business.name,
        }).addTo(map);
        marker.bindPopup(buildPopupContent(business));
        marker.on("click", () => {
          onRowSelectionChange((previous) => ({
            ...previous,
            [id]: !previous[id],
          }));
        });
        markers.set(id, marker);
      }

      const isSelected = Boolean(rowSelection[id]);
      marker.setIcon(isSelected ? selectedIcon : defaultIcon);
      marker.setZIndexOffset(isSelected ? 999 : 0);
    }

    // Fit bounds once, only when there was no persisted viewport to
    // restore — after that, respect however the user has panned/zoomed
    // rather than yanking the view around on every new search.
    if (hasAny && !didFitBoundsRef.current && !readStoredViewport()) {
      map.fitBounds(bounds);
      didFitBoundsRef.current = true;
    }
  }, [businesses, rowSelection, getRowId, onRowSelectionChange]);

  return (
    <div
      className={cn(
        "border-border relative overflow-hidden rounded-lg border",
        className,
      )}
    >
      <div ref={containerRef} className="h-full w-full" />

      {errorMessage && (
        <div className="bg-background absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-destructive text-sm">{errorMessage}</p>
        </div>
      )}
    </div>
  );
}

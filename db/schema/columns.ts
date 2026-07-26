import { customType } from "drizzle-orm/pg-core";

/**
 * Case-insensitive text. Used for `users.email` — architecture.md §5.2
 * specifies `email (citext unique)`. Requires the `citext` Postgres
 * extension, enabled by the first migration.
 */
export const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

/**
 * Raw binary storage for AES-256-GCM ciphertext. Used for
 * `user_settings.google_api_key_enc` / `ai_api_key_enc` — architecture.md
 * §5.2 specifies both as `bytea, encrypted`.
 */
export const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export type LatLng = { lat: number; lng: number };

/**
 * `geography(Point, 4326)` — used for `businesses.location`
 * (architecture.md §5.2 `location (geography POINT — PostGIS)`).
 * `geography`, not `geometry`, deliberately: geography columns do
 * geodetic (great-circle) distance math out of the box, which is what
 * "within N km" business queries (§5.4 GIST index, future map-bounds
 * search) need — `geometry` would require careful manual SRID/planar
 * handling to get the same behavior.
 *
 * drizzle-orm's built-in `geometry()` helper (pg-core) only emits the
 * `geometry` PostGIS type, not `geography`, so this is a custom type
 * mirroring its wire format: writes go in as WKT text (`POINT(lng
 * lat)` — PostGIS's `geography_in` accepts WKT directly and defaults
 * the SRID to 4326, the only one geography supports); reads come back
 * as hex-encoded EWKB, which is parsed by hand since drizzle-orm
 * doesn't export its own EWKB parser publicly.
 */
export const geographyPoint = customType<{ data: LatLng }>({
  dataType() {
    return "geography(Point, 4326)";
  },
  toDriver(value) {
    return `POINT(${value.lng} ${value.lat})`;
  },
  fromDriver(value) {
    return parsePointEWKB(value as string);
  },
});

/**
 * Minimal EWKB parser for the single case this app stores: a 2D Point,
 * with or without an embedded SRID. Layout: 1 byte endianness, 4 bytes
 * geometry type (the 0x20000000 bit flags an embedded SRID), optional
 * 4-byte SRID, then two 8-byte little/big-endian floats (X = lng, Y =
 * lat).
 */
function parsePointEWKB(hex: string): LatLng {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  const view = new DataView(bytes.buffer);
  let offset = 0;

  const littleEndian = bytes[offset] === 1;
  offset += 1;

  const geomType = view.getUint32(offset, littleEndian);
  offset += 4;

  const hasSrid = (geomType & 0x20000000) !== 0;
  if (hasSrid) offset += 4;

  const lng = view.getFloat64(offset, littleEndian);
  offset += 8;
  const lat = view.getFloat64(offset, littleEndian);

  return { lat, lng };
}

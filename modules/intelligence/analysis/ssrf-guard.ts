import "server-only";
import dns from "node:dns";
import { Agent } from "undici";
import ipaddr from "ipaddr.js";

/**
 * SSRF protection (architecture.md §13.5: "SSRF (sharpest risk): the
 * analyzer fetches arbitrary URLs → resolve host, block private/
 * link-local/cloud-metadata ranges, cap redirects, cap size, enforce
 * timeouts, controlled egress. Treated as a P0 control."). This file is
 * the "resolve host, block ... ranges" + "controlled egress" half;
 * `guarded-fetch.ts` handles the redirect/size/timeout caps around it.
 *
 * Default-deny, not a hand-rolled CIDR blocklist: `ipaddr.js`
 * classifies every address into a named range (private, loopback,
 * linkLocal, uniqueLocal, carrierGradeNat, reserved, multicast,
 * benchmarking, ...), and only the `"unicast"` classification is
 * allowed through. `linkLocal` alone covers the single most exploited
 * SSRF target — 169.254.169.254, the cloud-provider metadata endpoint
 * on AWS/GCP/Azure — but the point of allow-listing one safe category
 * instead of block-listing many dangerous ones is that it doesn't rely
 * on this list being exhaustive.
 *
 * The validation runs inside a custom `net.connect`-style `lookup`
 * function, wired into an undici `Agent` via `connect: { lookup }` —
 * not a separate "resolve, check, then fetch normally" pre-check. A
 * separate pre-check has a real gap: fetch()'s own internal DNS
 * resolution could return a *different* address at actual connect
 * time (DNS rebinding), especially across the redirect hops
 * `guarded-fetch.ts` follows. Hooking the connector's own lookup means
 * whatever address this function approves is the address undici
 * actually connects to — there's no second resolution to rebind.
 */

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function assertAllowedProtocol(url: URL): void {
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new SsrfBlockedError(
      `Refusing to fetch a non-HTTP(S) URL (protocol: ${url.protocol})`,
    );
  }
}

function isPublicAddress(address: string): boolean {
  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.parse(address);
  } catch {
    return false;
  }

  // An IPv4 address smuggled inside an IPv4-mapped IPv6 literal
  // (::ffff:169.254.169.254) must be judged by IPv4's range rules, not
  // IPv6's — `range()` on the un-normalized address would just say
  // "ipv4Mapped" and miss that the embedded address is unsafe.
  if (addr instanceof ipaddr.IPv6 && addr.isIPv4MappedAddress()) {
    return addr.toIPv4Address().range() === "unicast";
  }

  return addr.range() === "unicast";
}

function blockedError(message: string): NodeJS.ErrnoException {
  return Object.assign(new SsrfBlockedError(message), { code: "EACCES" });
}

function notFoundError(hostname: string): NodeJS.ErrnoException {
  return Object.assign(
    new SsrfBlockedError(`${hostname} did not resolve to any address`),
    { code: "ENOTFOUND" },
  );
}

/**
 * Custom DNS lookup matching Node's `net.connect` `lookup` option
 * contract — undici's `Agent` invokes this per connection attempt (see
 * the file-level comment for why that timing matters).
 *
 * Node's `lookup` callback has **two different shapes** depending on
 * `options.all`: `(err, addresses[])` when `true`, `(err, address,
 * family)` otherwise — undici calls this with `all: true` (for Happy
 * Eyeballs / RFC 8305 dual-stack racing), so this always resolves with
 * `{ all: true }` itself and *filters* the result down to public
 * addresses only, rather than validating a single candidate — a
 * hostname with one public and one non-public record (misconfiguration
 * or a rebinding attempt) should still connect over whichever address
 * is actually safe, not be treated as fully blocked because one record
 * wasn't. If every returned address is unsafe (or none resolved at
 * all), the callback receives an error and no connection is attempted.
 */
export function safeLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    addresses: string | dns.LookupAddress[],
    family?: number,
  ) => void,
): void {
  dns.lookup(
    hostname,
    { ...options, all: true, verbatim: true },
    (err, addresses) => {
      if (err) {
        callback(err, "");
        return;
      }

      if (addresses.length === 0) {
        callback(notFoundError(hostname), "");
        return;
      }

      const safe = addresses.filter((entry) => isPublicAddress(entry.address));
      if (safe.length === 0) {
        callback(
          blockedError(
            `Refusing to connect to ${hostname}: no resolved address is public (got ${addresses.map((entry) => entry.address).join(", ")})`,
          ),
          "",
        );
        return;
      }

      if (options.all) {
        callback(null, safe);
        return;
      }

      const [first] = safe;
      callback(null, first!.address, first!.family);
    },
  );
}

/**
 * Shared across every analyzer fetch — an `Agent` pools connections, so
 * one long-lived instance (not one per request) is both correct and
 * more efficient.
 */
export const sharedSsrfSafeDispatcher = new Agent({
  connect: { lookup: safeLookup },
});

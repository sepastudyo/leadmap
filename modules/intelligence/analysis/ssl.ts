import "server-only";
import tls from "node:tls";

import { ANALYZER_TIMEOUT_MS } from "@/config/constants";

import { safeLookup } from "./ssrf-guard";

/**
 * [11 SSL] (architecture.md §9.1/§9.2: "from the HTTPS handshake: cert
 * validity, expiry, issuer" / "SSL: HTTPS present, certificate
 * validity/expiry/issuer"), extended with security header analysis as
 * this phase's instructions name explicitly (not in §9.2's own SSL
 * bullet, but the same "response-level security posture" concern the
 * bullet groups HTTPS/cert under — see docs/sprint-3.md).
 *
 * Certificate inspection needs a live TLS handshake — `fetch`/`undici`
 * don't expose the peer certificate through their public API, so this
 * is a dedicated `tls.connect` (handshake only, no HTTP request sent,
 * socket destroyed immediately after) rather than a duplicate page
 * fetch. It targets the same host [1 Acquire] already resolved
 * (`finalUrl`, post-redirect) and reuses `safeLookup` — the exact same
 * SSRF-guarded DNS resolution `guarded-fetch.ts` uses — so this new
 * connection carries the same P0 SSRF protection (architecture.md
 * §13.5), not a weaker ad hoc check.
 */

export type CertificateInfo = {
  issuer: string | null;
  subject: string | null;
  /** ISO 8601. */
  validFrom: string | null;
  /** ISO 8601. */
  validTo: string | null;
  daysUntilExpiry: number | null;
  isExpired: boolean;
  /** Whether the certificate chain is trusted (`tls.TLSSocket#authorized`) — `false` for self-signed/expired/hostname-mismatched certs. */
  isValid: boolean;
  authorizationError: string | null;
};

const SECURITY_HEADERS = [
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
] as const;

export type SecurityHeaderAnalysis = {
  present: string[];
  missing: string[];
  hsts: boolean;
  contentSecurityPolicy: boolean;
  xFrameOptions: boolean;
  xContentTypeOptions: boolean;
  referrerPolicy: boolean;
  permissionsPolicy: boolean;
};

export type SslAnalysis = {
  httpsPresent: boolean;
  /** `null` when not served over HTTPS, or when the handshake itself failed/timed out. */
  certificate: CertificateInfo | null;
  securityHeaders: SecurityHeaderAnalysis;
};

function analyzeSecurityHeaders(
  headers: Record<string, string>,
): SecurityHeaderAnalysis {
  const present: string[] = [];
  const missing: string[] = [];

  for (const name of SECURITY_HEADERS) {
    if (headers[name] !== undefined) present.push(name);
    else missing.push(name);
  }

  return {
    present,
    missing,
    hsts: headers["strict-transport-security"] !== undefined,
    contentSecurityPolicy: headers["content-security-policy"] !== undefined,
    xFrameOptions: headers["x-frame-options"] !== undefined,
    xContentTypeOptions: headers["x-content-type-options"] !== undefined,
    referrerPolicy: headers["referrer-policy"] !== undefined,
    permissionsPolicy: headers["permissions-policy"] !== undefined,
  };
}

function firstString(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0]!;
  return null;
}

function formatDistinguishedName(
  entry: tls.PeerCertificate["issuer"] | undefined,
): string | null {
  if (!entry) return null;
  return firstString(entry.CN) ?? firstString(entry.O);
}

/**
 * `rejectUnauthorized: false` so the handshake still completes for
 * self-signed/expired/mismatched certs — SSL analysis needs to *report*
 * on a bad certificate, not just fail closed the way an ordinary HTTPS
 * client should. Trust is instead surfaced via `isValid`/
 * `authorizationError` from `socket.authorized`.
 */
function fetchCertificate(
  hostname: string,
  port: number,
  timeoutMs: number,
): Promise<CertificateInfo | null> {
  return new Promise((resolve) => {
    let settled = false;

    const socket = tls.connect({
      host: hostname,
      port,
      servername: hostname,
      lookup: safeLookup,
      rejectUnauthorized: false,
      timeout: timeoutMs,
    });

    const finish = (result: CertificateInfo | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      if (!cert || Object.keys(cert).length === 0) {
        finish(null);
        return;
      }

      const validTo = cert.valid_to
        ? new Date(cert.valid_to).toISOString()
        : null;
      const daysUntilExpiry =
        validTo !== null
          ? Math.floor((new Date(validTo).getTime() - Date.now()) / 86_400_000)
          : null;

      finish({
        issuer: formatDistinguishedName(cert.issuer),
        subject: formatDistinguishedName(cert.subject),
        validFrom: cert.valid_from
          ? new Date(cert.valid_from).toISOString()
          : null,
        validTo,
        daysUntilExpiry,
        isExpired: daysUntilExpiry !== null && daysUntilExpiry < 0,
        isValid: socket.authorized,
        authorizationError: socket.authorized
          ? null
          : socket.authorizationError.message,
      });
    });

    socket.once("timeout", () => finish(null));
    socket.once("error", () => finish(null));
  });
}

export async function analyzeSsl(
  finalUrl: string,
  headers: Record<string, string>,
): Promise<SslAnalysis> {
  let httpsPresent = false;
  let certificate: CertificateInfo | null = null;

  try {
    const parsed = new URL(finalUrl);
    httpsPresent = parsed.protocol === "https:";
    if (httpsPresent) {
      const port = parsed.port ? Number(parsed.port) : 443;
      certificate = await fetchCertificate(
        parsed.hostname,
        port,
        ANALYZER_TIMEOUT_MS,
      );
    }
  } catch {
    httpsPresent = false;
  }

  return {
    httpsPresent,
    certificate,
    securityHeaders: analyzeSecurityHeaders(headers),
  };
}

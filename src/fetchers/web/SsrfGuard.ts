// ─── SSRF Guard — deny fetches into private address space ────
// Agent-controlled URLs (read_web_page etc.) are fed by untrusted
// inputs (web content, Discord messages, marketplace listings). A
// prompt-injected URL must not be able to reach loopback services,
// the LAN (NAS, vault-service, MinIO), or cloud metadata endpoints
// (169.254.169.254). This guard validates every hop:
//
//   1. Protocol must be http/https.
//   2. The hostname's DNS resolution (every A/AAAA record) must land
//      in public address space — loopback, RFC1918, link-local/
//      metadata, CGNAT, unique-local and unspecified ranges are
//      rejected, including IPv4-mapped IPv6 forms.
//   3. Redirects are followed MANUALLY and each Location is
//      re-validated — a public URL redirecting to an internal one is
//      the classic bypass.
//
// Known residual: TOCTOU/DNS-rebinding (host re-resolving differently
// between the check and the fetch) is out of scope for this slice —
// it needs a socket-level pinned dispatcher.
//
// Research basis (harness_landscape_survey_2026-07.md, D2):
// deny-by-default egress per Anthropic sandbox-runtime
// (github.com/anthropic-experimental/sandbox-runtime) and Claude
// Code's sandboxing model — this is the "SSRF/private-IP + metadata-
// endpoint guard in a central outbound-fetch wrapper" slice.
// ─────────────────────────────────────────────────────────────

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 5;

/** Normalize IPv4-mapped IPv6 (::ffff:10.0.0.1) to the inner IPv4. */
function normalizeAddress(address: string): string {
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? mapped[1] : address.toLowerCase();
}

/** True when the IP lands in a private/reserved/internal range. */
export function isPrivateAddress(rawAddress: string): boolean {
  const address = normalizeAddress(rawAddress);

  if (isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    const [first, second] = octets;
    if (octets.some((octet) => Number.isNaN(octet) || octet > 255)) return true;
    return (
      first === 0 || // 0.0.0.0/8 unspecified
      first === 10 || // 10/8 private
      first === 127 || // 127/8 loopback
      (first === 100 && second >= 64 && second <= 127) || // 100.64/10 CGNAT
      (first === 169 && second === 254) || // 169.254/16 link-local + cloud metadata
      (first === 172 && second >= 16 && second <= 31) || // 172.16/12 private
      (first === 192 && second === 168) || // 192.168/16 private
      (first === 198 && (second === 18 || second === 19)) || // 198.18/15 benchmarking
      first >= 224 // multicast + reserved + broadcast
    );
  }

  if (isIP(address) === 6) {
    return (
      address === "::" || // unspecified
      address === "::1" || // loopback
      address.startsWith("fc") || // fc00::/7 unique-local
      address.startsWith("fd") ||
      address.startsWith("fe8") || // fe80::/10 link-local
      address.startsWith("fe9") ||
      address.startsWith("fea") ||
      address.startsWith("feb")
    );
  }

  // Not an IP literal — caller resolves via DNS first
  return true;
}

export interface UrlValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Validate that a URL is a public http(s) address — protocol check,
 * then every DNS resolution of the hostname must be public space.
 */
export async function validatePublicWebUrl(
  rawUrl: string,
): Promise<UrlValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: `Invalid URL: ${rawUrl}` };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      error: `Blocked non-http(s) protocol: ${parsed.protocol}`,
    };
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      return {
        ok: false,
        error: `Blocked private/internal address: ${hostname}`,
      };
    }
    return { ok: true };
  }

  try {
    const resolutions = await lookup(hostname, { all: true, verbatim: true });
    if (resolutions.length === 0) {
      return { ok: false, error: `Host did not resolve: ${hostname}` };
    }
    for (const resolution of resolutions) {
      if (isPrivateAddress(resolution.address)) {
        return {
          ok: false,
          error: `Blocked: ${hostname} resolves to private/internal address ${resolution.address}`,
        };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, error: `DNS resolution failed: ${hostname}` };
  }
}

/**
 * fetch() restricted to public address space, following redirects
 * manually so every hop is re-validated.
 */
export async function fetchPublicUrl(
  rawUrl: string,
  init: RequestInit = {},
): Promise<Response> {
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const verdict = await validatePublicWebUrl(currentUrl);
    if (!verdict.ok) {
      throw new Error(verdict.error);
    }

    const response = await fetch(currentUrl, {
      ...init,
      redirect: "manual",
    });

    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.get("location")
    ) {
      const nextUrl = new URL(
        response.headers.get("location")!,
        currentUrl,
      ).toString();
      // Drain/cancel the redirect body before following
      await response.body?.cancel().catch(() => {});
      currentUrl = nextUrl;
      continue;
    }

    return response;
  }

  throw new Error(`Too many redirects (>${MAX_REDIRECTS}): ${rawUrl}`);
}

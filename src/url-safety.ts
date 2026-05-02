import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";

// SECURITY NOTE — Known limitations of this guard:
// 1. DNS rebinding: fetch call sites should use assertSafeUrlResolved() so
//    hostnames are checked both textually and after DNS resolution.
// 2. There is still a small TOCTOU window because Node's fetch resolves again
//    internally after this preflight. Closing that completely would require a
//    custom undici dispatcher pinned to the vetted resolved address.
// 3. Numeric IPv4 short forms: `http://0/`, `http://2130706433/` (= 127.0.0.1
//    in decimal) are normalized by Node's URL parser and pass through here as
//    the parsed dotted form, so most short-form bypasses are caught by the
//    CIDR check below.
//
// Blocked IPv4 CIDR ranges (no external deps — manual CIDR check).
const BLOCKED_IPV4_RANGES: Array<{ base: number; mask: number }> = [
  { base: ipv4ToInt("0.0.0.0"), mask: prefixToMask(8) },     // "this network"; 0.0.0.0 routes to localhost on most OSes
  { base: ipv4ToInt("127.0.0.0"), mask: prefixToMask(8) },   // loopback
  { base: ipv4ToInt("10.0.0.0"), mask: prefixToMask(8) },    // RFC-1918
  { base: ipv4ToInt("172.16.0.0"), mask: prefixToMask(12) }, // RFC-1918
  { base: ipv4ToInt("192.168.0.0"), mask: prefixToMask(16) },// RFC-1918
  { base: ipv4ToInt("169.254.0.0"), mask: prefixToMask(16) },// link-local / cloud metadata
  { base: ipv4ToInt("100.64.0.0"), mask: prefixToMask(10) }, // CGNAT (RFC 6598)
  { base: ipv4ToInt("224.0.0.0"), mask: prefixToMask(4) },   // multicast
  { base: ipv4ToInt("240.0.0.0"), mask: prefixToMask(4) }    // reserved (incl. 255.255.255.255 broadcast)
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".");
  return (
    ((Number(parts[0]) << 24) |
      (Number(parts[1]) << 16) |
      (Number(parts[2]) << 8) |
      Number(parts[3])) >>> 0
  );
}

function prefixToMask(prefix: number): number {
  return (0xffffffff << (32 - prefix)) >>> 0;
}

function isBlockedIPv4(hostname: string): boolean {
  if (isIP(hostname) !== 4) return false;
  const ip = ipv4ToInt(hostname);
  return BLOCKED_IPV4_RANGES.some(({ base, mask }) => (ip & mask) === (base & mask));
}

function isBlockedIPv6(hostname: string): boolean {
  // Strip brackets from IPv6 addresses in URL hostnames
  const raw = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  if (isIP(raw) !== 6) return false;
  const lower = raw.toLowerCase();

  // loopback ::1, unspecified ::
  if (lower === "::1" || lower === "::") return true;

  // fc00::/7 — ULA (fc and fd prefixes in the first hextet)
  if (/^fc[0-9a-f]{0,2}:/.test(lower) || /^fd[0-9a-f]{0,2}:/.test(lower)) return true;

  // fe80::/10 — link-local (fe80, fe90, fea0, feb0)
  if (/^fe[89ab][0-9a-f]?:/.test(lower)) return true;

  // ff00::/8 — multicast
  if (/^ff[0-9a-f]{0,2}:/.test(lower)) return true;

  // ::ffff:a.b.c.d — IPv4-mapped IPv6: extract embedded IPv4 and re-check
  const mappedDotted = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedDotted && isBlockedIPv4(mappedDotted[1] ?? "")) return true;

  // ::ffff:hex:hex — undici/Node may emit hex pair form for mapped addresses
  const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const high = parseInt(mappedHex[1] ?? "0", 16);
    const low = parseInt(mappedHex[2] ?? "0", 16);
    const dotted = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
    if (isBlockedIPv4(dotted)) return true;
  }

  return false;
}

function assertSafeHostname(hostname: string): void {
  if (hostname === "localhost" || hostname === "" || hostname.endsWith(".localhost")) {
    throw new Error(`Unsafe URL: hostname "${hostname || "<empty>"}" is blocked`);
  }

  if (isBlockedIPv4(hostname)) {
    throw new Error(`Unsafe URL: IPv4 address "${hostname}" is in a blocked range`);
  }

  if (isBlockedIPv6(hostname)) {
    throw new Error(`Unsafe URL: IPv6 address "${hostname}" is in a blocked range`);
  }
}

export function assertSafeUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Unsafe URL: invalid URL "${rawUrl}"`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsafe URL: protocol "${parsed.protocol}" is not allowed`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost variants and short numeric IPv4 forms (0, 0.0, 127.1, etc.)
  assertSafeHostname(hostname);

  return parsed;
}

export async function assertSafeUrlResolved(rawUrl: string): Promise<URL> {
  const parsed = assertSafeUrl(rawUrl);
  const hostname = parsed.hostname.toLowerCase();

  if (isIP(hostname) !== 0) return parsed;

  let addresses: LookupAddress[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Unsafe URL: failed to resolve hostname "${hostname}": ${reason}`);
  }

  if (addresses.length === 0) {
    throw new Error(`Unsafe URL: hostname "${hostname}" resolved to no addresses`);
  }

  for (const address of addresses) {
    assertSafeHostname(address.address.toLowerCase());
  }

  return parsed;
}
